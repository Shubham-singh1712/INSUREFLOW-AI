import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { processClaimPipeline } from '@/lib/claim-processing/pipeline';
import { processDemoClaimPipeline } from '@/lib/claim-processing/demo-pipeline';
import { createClaim, saveClaimState } from '@/lib/claim-processing/db';
import { createId } from '@/lib/claim-processing/utils';
import { mapExtractedFieldsToUi } from '@/lib/claim-processing/mapping';
import { logger } from '@/lib/claim-processing/logger';
import { getDemoModeState } from '@/lib/demoMode';
import { saveReviewClaim } from '@/lib/liveClaims';
import type { ExtractedClaimData } from '@/lib/claims';
import { getWorkflowSettings } from '@/lib/workflowSettings';
import { shouldRequireManualReview } from '@/lib/claimLifecycle';
import { revalidateClaimViews } from '@/lib/claimViewRevalidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  logger.info('API', 'Received claim process request');

  try {
    const { user, response: authResponse } = await requireUser();
    if (authResponse) {
      return authResponse;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const uploadSessionId = (formData.get('uploadSessionId') as string) || createId('session');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 30MB limit' },
        { status: 413 }
      );
    }

    const claimId = createId('claim');
    const buffer = Buffer.from(await file.arrayBuffer());

    // Create DB Record
    await createClaim(user.id, claimId, uploadSessionId, file.name, file.size);

    const sessionData = {
      claimId,
      uploadSessionId,
      originalFileName: file.name,
      fileSizeBytes: file.size,
      uploadStartedAt: new Date().toISOString(),
    };

    // Check Demo Mode
    const demoMode = await getDemoModeState();

    // Run modular pipeline
    let packet;
    if (demoMode.enabled) {
      packet = await processDemoClaimPipeline(buffer, sessionData);
    } else {
      packet = await processClaimPipeline(buffer, sessionData);
    }

    // Map the deep ExtractedFields structure to a flat array for the UI Review Screen
    const uiFields = mapExtractedFieldsToUi(packet.extractedFields, packet);

    // Sync to local liveClaims.json file cache so that the claim is visible in dashboards & queues
    try {
      const confirmedData: ExtractedClaimData = {
        patient: {
          full_name: packet.extractedFields?.patient?.full_name?.value || '',
          date_of_birth: packet.extractedFields?.patient?.dob?.value || '',
          gender: packet.extractedFields?.patient?.gender?.value || '',
          address: packet.extractedFields?.patient?.address?.value || '',
          contact_phone: packet.extractedFields?.patient?.phone?.value || '',
          contact_email: '',
        },
        insurance: {
          policyholder_name: '',
          group_number: packet.extractedFields?.insurance?.corporate_or_group_id?.value || '',
          member_id: packet.extractedFields?.insurance?.member_id?.value || '',
          payer_id: packet.extractedFields?.insurance?.insurance_id?.value || '',
          plan_name: packet.extractedFields?.insurance?.provider_name?.value || '',
        },
        pre_authorization: {
          approval_code: '',
          authorized_from: '',
          authorized_to: '',
        },
        clinical: {
          admission_date: packet.extractedFields?.hospital?.admission_date?.value || '',
          discharge_date: packet.extractedFields?.hospital?.discharge_date?.value || '',
          attending_physician: packet.extractedFields?.hospital?.doctor_name?.value || '',
          hospital_npi: '',
          hospital_tax_id: '',
          facility_name: packet.extractedFields?.hospital?.facility_name?.value || '',
          principal_diagnosis: packet.extractedFields?.clinical?.diagnosis?.value || '',
        },
        coding: {
          icd10_codes: (packet.extractedFields?.clinical?.icd10_codes?.value || []).map((code) => ({
            code,
            description: '',
            confidence: 100,
          })),
          cpt_codes: [],
        },
        billing: {
          total_billed_amount: String(packet.extractedFields?.financial?.final_bill?.value || '0'),
          line_items: [],
        },
        extraction_meta: {
          overall_confidence: packet.ocrConfidence,
          low_confidence_fields: [],
          requires_manual_review: shouldRequireManualReview(packet.state),
        },
      };

      const settings = await getWorkflowSettings();
      await saveReviewClaim({
        userId: user.id,
        claimId: packet.claimId,
        confirmedData,
        reviewReasons: packet.validationErrors.map((e) => e.issue),
        readiness: packet.readiness,
        threshold: settings.aiThreshold,
      });
      logger.info('API', `Synced claim ${packet.claimId} to local file cache`);
    } catch (cacheErr) {
      logger.error('API', `Failed to sync claim ${packet.claimId} to local file cache`, cacheErr);
    }

    return NextResponse.json({
      ...packet,
      uiFields,
    });
  } catch (error: any) {
    logger.error('API', 'Claim processing error', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred during processing.',
      },
      { status: error.status || 500 }
    );
  } finally {
    revalidateClaimViews();
  }
}
