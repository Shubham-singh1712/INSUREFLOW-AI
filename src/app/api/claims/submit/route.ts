import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { saveClaimState } from '@/lib/claim-processing/db';
import { logger } from '@/lib/claim-processing/logger';
import { getDemoModeState } from '@/lib/demoMode';
import { saveSubmittedClaim, updateLiveClaimStatus } from '@/lib/liveClaims';
import type { ExtractedClaimData } from '@/lib/claims';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  logger.info('API', 'Received claim submit request');

  try {
    const { user, response: authResponse } = await requireUser();
    if (authResponse) {
      return authResponse;
    }

    const { claimId, action, finalData } = await request.json();

    if (!claimId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing claimId or action' },
        { status: 400 }
      );
    }

    const demoMode = await getDemoModeState();

    if (action === 'submit') {
      await saveClaimState(claimId, 'SUBMITTED', {
        extractedFields: finalData?.extractedFields,
      });
      logger.info('API', `Claim ${claimId} successfully submitted to DB`);

      // Sync to local live-claims.json file cache
      try {
        const deepExtracted = finalData?.extractedFields;
        const confirmedData: ExtractedClaimData = {
          patient: {
            full_name: deepExtracted?.patient?.full_name?.value || '',
            date_of_birth: deepExtracted?.patient?.dob?.value || '',
            gender: deepExtracted?.patient?.gender?.value || '',
            address: deepExtracted?.patient?.address?.value || '',
            contact_phone: deepExtracted?.patient?.phone?.value || '',
            contact_email: '',
          },
          insurance: {
            policyholder_name: '',
            group_number: deepExtracted?.insurance?.corporate_or_group_id?.value || '',
            member_id: deepExtracted?.insurance?.member_id?.value || '',
            payer_id: deepExtracted?.insurance?.insurance_id?.value || '',
            plan_name: deepExtracted?.insurance?.provider_name?.value || '',
          },
          pre_authorization: {
            approval_code: '',
            authorized_from: '',
            authorized_to: '',
          },
          clinical: {
            admission_date: deepExtracted?.hospital?.admission_date?.value || '',
            discharge_date: deepExtracted?.hospital?.discharge_date?.value || '',
            attending_physician: deepExtracted?.hospital?.doctor_name?.value || '',
            hospital_npi: '',
            hospital_tax_id: '',
            facility_name: deepExtracted?.hospital?.facility_name?.value || '',
            principal_diagnosis: deepExtracted?.clinical?.diagnosis?.value || '',
          },
          coding: {
            icd10_codes: (deepExtracted?.clinical?.icd10_codes?.value || []).map((code: string) => ({
              code,
              description: '',
              confidence: 100,
            })),
            cpt_codes: [],
          },
          billing: {
            total_billed_amount: String(deepExtracted?.financial?.final_bill?.value || '0'),
            line_items: [],
          },
          extraction_meta: {
            overall_confidence: 95,
            low_confidence_fields: [],
            requires_manual_review: false,
          },
        };

        await saveSubmittedClaim({
          userId: user.id,
          claimId,
          confirmedData,
        });
        logger.info('API', `Synced claim ${claimId} to local file cache as SUBMITTED`);
      } catch (cacheErr) {
        logger.error('API', `Failed to sync claim ${claimId} to local file cache`, cacheErr);
      }

      // Simulate TPA auto-approval in Demo Mode after a 6-second delay
      if (demoMode.enabled) {
        const rejectionRisk = finalData?.rejectionRisk || 'low';
        const errorsCount = finalData?.validationErrors?.length || 0;

        logger.info('API', `Demo Mode: Scheduling TPA auto-adjudication for ${claimId} (risk: ${rejectionRisk}, errors: ${errorsCount}) in 6s`);
        setTimeout(async () => {
          try {
            if (rejectionRisk === 'low') {
              await saveClaimState(claimId, 'APPROVED');
              await updateLiveClaimStatus(user.id, claimId, 'approved');
              logger.info('API', `Demo Mode: Claim ${claimId} automatically APPROVED`);
            } else if (rejectionRisk === 'medium') {
              if (errorsCount === 0) {
                await saveClaimState(claimId, 'APPROVED');
                await updateLiveClaimStatus(user.id, claimId, 'approved');
                logger.info('API', `Demo Mode: Repaired Claim ${claimId} automatically APPROVED`);
              } else {
                logger.info('API', `Demo Mode: Claim ${claimId} remains in SUBMITTED state because validation errors (${errorsCount}) are not resolved.`);
              }
            } else if (rejectionRisk === 'high') {
              await saveClaimState(claimId, 'REJECTED');
              await updateLiveClaimStatus(user.id, claimId, 'rejected');
              logger.info('API', `Demo Mode: Claim ${claimId} automatically REJECTED due to high rejection risk`);
            }
          } catch (apprErr) {
            logger.error('API', `Demo Mode auto-adjudication failed for ${claimId}`, apprErr);
          }
        }, 6000);
      }

      return NextResponse.json({ success: true, message: 'Claim submitted successfully' });
    } else if (action === 'reject') {
      await saveClaimState(claimId, 'REJECTED');
      
      try {
        await updateLiveClaimStatus(user.id, claimId, 'rejected');
      } catch (cacheErr) {
        logger.error('API', `Failed to update reject status in cache for ${claimId}`, cacheErr);
      }

      logger.info('API', `Claim ${claimId} rejected`);
      return NextResponse.json({ success: true, message: 'Claim rejected' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    logger.error('API', 'Claim submission error', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred during submission.',
      },
      { status: error.status || 500 }
    );
  }
}
