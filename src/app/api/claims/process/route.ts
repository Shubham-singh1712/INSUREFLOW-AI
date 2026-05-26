import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { processClaimPipeline } from '@/lib/claim-processing/pipeline';
import { createClaim, saveClaimState } from '@/lib/claim-processing/db';
import { createId } from '@/lib/claim-processing/utils';
import { mapExtractedFieldsToUi } from '@/lib/claim-processing/mapping';
import { logger } from '@/lib/claim-processing/logger';

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

    // Run modular pipeline // MODIFIED
    const packet = await processClaimPipeline(buffer, sessionData); // MODIFIED

    // Map the deep ExtractedFields structure to a flat array for the UI Review Screen // MODIFIED
    const uiFields = mapExtractedFieldsToUi(packet.extractedFields, packet); // MODIFIED

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
  }
}
