import { createClient } from '@/lib/supabase/server';
import { ClaimState, ClaimPacket } from './types';
import { logger } from './logger';

export const saveClaimState = async (
  claimId: string,
  state: ClaimState,
  data?: Partial<ClaimPacket>
) => {
  const supabase = await createClient();
  logger.info('DB', `Updating claim ${claimId} to state ${state}`);

  const updatePayload: any = {
    status: state,
    updated_at: new Date().toISOString(),
  };

  if (data?.extractedFields) {
    updatePayload.extracted_data = data.extractedFields;
  }
  if (data?.validationErrors) {
    updatePayload.validation_errors = data.validationErrors;
  }
  if (data?.repairSuggestions) {
    updatePayload.repair_suggestions = data.repairSuggestions;
  }
  if (data?.claimHealth !== undefined) {
    updatePayload.health_score = data.claimHealth;
  }
  if (data?.readiness !== undefined) {
    updatePayload.readiness_score = data.readiness;
  }
  if (data?.ocrConfidence !== undefined) {
    updatePayload.ocr_confidence = data.ocrConfidence;
  }
  if (data?.classifiedPages) {
    updatePayload.classified_pages = data.classifiedPages;
  }

  const { error } = await supabase
    .from('claims')
    .update(updatePayload)
    .eq('id', claimId);

  if (error) {
    logger.error('DB', `Failed to update claim ${claimId} state`, error);
    // Suppress error so pipeline can continue in-memory if DB isn't set up yet
    logger.info('DB', 'Proceeding without database persistence.');
  }
};

export const createClaim = async (
  userId: string,
  claimId: string,
  uploadSessionId: string,
  fileName: string,
  fileSize: number
) => {
  const supabase = await createClient();
  logger.info('DB', `Creating new claim record ${claimId} for user ${userId}`);

  const { error } = await supabase.from('claims').insert({
    id: claimId,
    user_id: userId,
    upload_session_id: uploadSessionId,
    file_name: fileName,
    file_size: fileSize,
    status: 'UPLOADED' satisfies ClaimState,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logger.error('DB', `Failed to create claim ${claimId}`, error);
    // Suppress error so pipeline can continue in-memory if DB isn't set up yet
    logger.info('DB', 'Proceeding without database persistence.');
  }
};
