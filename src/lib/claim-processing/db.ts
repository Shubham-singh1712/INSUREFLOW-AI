import { createClient } from '@/lib/supabase/server';
import { ClaimState, ClaimPacket } from './types';
import { logger } from './logger';

export const saveClaimState = async (
  claimId: string,
  state: ClaimState,
  data?: Partial<ClaimPacket>
) => {
  logger.info('DB', `Updating claim ${claimId} to state ${state}`);
  try {
    const supabase = await createClient();
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

    const { error } = await supabase.from('claims').update(updatePayload).eq('id', claimId);
    if (error) {
      logger.error('DB', `Failed to update claim ${claimId} state`, error);
    }
  } catch (dbErr: any) {
    logger.error('DB', `Database saveClaimState error: ${dbErr.message}`);
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
  logger.info('DB', `Creating new claim record ${claimId} for user ${userId}`);
  try {
    const supabase = await createClient();
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
    }
  } catch (dbErr: any) {
    logger.error('DB', `Database createClaim error: ${dbErr.message}`);
    logger.info('DB', 'Proceeding without database persistence.');
  }
};

export const getClaimById = async (claimId: string) => {
  logger.info('DB', `Fetching claim detail for ${claimId}`);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('claims').select('*').eq('id', claimId).single();
    if (error) {
      logger.error('DB', `Failed to fetch claim ${claimId}`, error);
      return null;
    }
    return data;
  } catch (dbErr: any) {
    logger.error('DB', `Database getClaimById error: ${dbErr.message}`);
    return null;
  }
};
