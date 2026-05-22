import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { saveClaimState } from '@/lib/claim-processing/db';
import { logger } from '@/lib/claim-processing/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  logger.info('API', 'Received claim submit request');

  try {
    await requireUser();

    const { claimId, action, finalData } = await request.json();

    if (!claimId || !action) {
      return NextResponse.json({ success: false, error: 'Missing claimId or action' }, { status: 400 });
    }

    if (action === 'submit') {
      await saveClaimState(claimId, 'SUBMITTED', {
        extractedFields: finalData?.extractedFields
      });
      logger.info('API', `Claim ${claimId} successfully submitted`);
      
      return NextResponse.json({ success: true, message: 'Claim submitted successfully' });
    } else if (action === 'reject') {
      await saveClaimState(claimId, 'REJECTED');
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
