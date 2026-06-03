import { createClient } from '@/lib/supabase/server';
import { ClaimState, ClaimPacket } from './types';
import { logger } from './logger';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import {
  getRepairStatusFromClaimStatus,
  normalizeClaimStatus,
  shouldRequireManualReview,
} from '@/lib/claimLifecycle';

// JSON Cache removed to enforce Supabase as the single source of truth

export const addAuditLog = async (claimId: string, action: string, details?: string) => {
  logger.info('DB_AUDIT', `Adding audit log for ${claimId}: [${action}] ${details || ''}`);
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('claim_audit_logs').insert({
      claim_id: claimId,
      action: action,
      details: details || '',
      created_at: new Date().toISOString()
    });
    if (error) {
      logger.error('DB_AUDIT', `Supabase failed to add audit log for claim ${claimId}`, error);
    }
  } catch (dbErr: any) {
    logger.error('DB_AUDIT', `Database addAuditLog error: ${dbErr.message}`);
  }

  // Audit cache sync removed
};

export const createClaim = async (
  userId: string,
  claimId: string,
  uploadSessionId: string,
  fileName: string,
  fileSize: number
) => {
  logger.info('DB', `Creating new claim record ${claimId} for user ${userId}`);
  
  // 1. Insert into Supabase
  try {
    const supabase = await createClient();

    // Delete existing claims with the same file name for this user to prevent duplicates
    await supabase.from('claims').delete().eq('user_id', userId).eq('file_name', fileName);

    const { error } = await supabase.from('claims').insert({
      id: claimId,
      user_id: userId,
      upload_session_id: uploadSessionId,
      file_name: fileName,
      file_size: fileSize,
      status: 'PROCESSING' satisfies ClaimState,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      health_score: 0,
      readiness_score: 0,
      ocr_confidence: 0,
      validation_count: 0,
      repair_suggestion_count: 0,
      assigned_reviewer: 'Desk Agent'
    });
    if (error) {
      logger.error('DB', `Failed to create claim ${claimId} in Supabase`, error);
    }
  } catch (dbErr: any) {
    logger.error('DB', `Database createClaim error: ${dbErr.message}`);
  }

  // Cache sync removed

  // 3. Add initial audit log
  await addAuditLog(claimId, 'Claim Uploaded', `PDF document uploaded: ${fileName} (${fileSize} bytes)`);
};

export const saveClaimState = async (
  claimId: string,
  state: ClaimState,
  data?: Partial<ClaimPacket>
) => {
  logger.info('DB', `Updating claim ${claimId} to state ${state}`);

  // 1. Update Supabase
  try {
    const supabase = await createClient();
    const coreStatus = normalizeClaimStatus(state);

    const updatePayload: any = {
      status: coreStatus,
      updated_at: new Date().toISOString(),
    };

    if (data?.extractedFields) {
      updatePayload.extracted_data = data.extractedFields;
      if (data.extractedFields.patient?.full_name?.value) {
        updatePayload.patient_name = data.extractedFields.patient.full_name.value;
      }
      if (data.extractedFields.hospital?.facility_name?.value) {
        updatePayload.hospital_name = data.extractedFields.hospital.facility_name.value;
      }
    }
    if (data?.validationErrors) {
      updatePayload.validation_errors = data.validationErrors;
      updatePayload.validation_count = data.validationErrors.length;
    }
    if (data?.repairSuggestions) {
      updatePayload.repair_suggestions = data.repairSuggestions;
      updatePayload.repair_suggestion_count = data.repairSuggestions.length;
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
    if (data?.rejectionRisk !== undefined) {
      updatePayload.rejection_risk = data.rejectionRisk;
    }

    const { error } = await supabase.from('claims').update(updatePayload).eq('id', claimId);
    if (error) {
      logger.error('DB', `Failed to update claim ${claimId} state in Supabase`, error);
    }
  } catch (dbErr: any) {
    logger.error('DB', `Database saveClaimState error: ${dbErr.message}`);
  }

  // Local cache sync removed to enforce Supabase as the single source of truth

  // 3. Add transition audit log
  let logMessage = '';
  const sUpper = String(state || '').toUpperCase();
  if (sUpper === 'PROCESSING') {
    logMessage = `AI processing initiated`;
  } else if (sUpper === 'EXTRACTED') {
    logMessage = `AI processing completed`;
  } else if (sUpper === 'REVIEW_REQUIRED' || sUpper === 'VALIDATION_REQUIRED' || sUpper === 'UNDER_REVIEW') {
    const errCount = data?.validationErrors?.length || 0;
    logMessage =
      errCount > 0
        ? `Under review: ${errCount} issue${errCount === 1 ? '' : 's'}`
        : 'Queued for manual validation';
  } else if (sUpper === 'READY' || sUpper === 'READY_TO_SUBMIT' || sUpper === 'READY_FOR_SUBMISSION') {
    logMessage = `Claim marked ready for submission`;
  } else if (sUpper === 'SUBMITTED') {
    logMessage = `Claim submitted`;
  } else if (sUpper === 'APPROVED') {
    logMessage = `Claim approved`;
  } else if (sUpper === 'REJECTED') {
    logMessage = `Claim rejected`;
  }

  if (logMessage) {
    await addAuditLog(claimId, state, logMessage);
  }
};

export const getClaimById = async (claimId: string) => {
  logger.info('DB', `Fetching claim detail for ${claimId}`);
  let claimData: any = null;

  // 1. Try Supabase
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('claims').select('*').eq('id', claimId).single();
    if (!error && data) {
      claimData = data;
      // Fetch audit logs
      const { data: auditLogs, error: logsErr } = await supabase
        .from('claim_audit_logs')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: true });

      if (!logsErr && auditLogs) {
        claimData.audit_logs = auditLogs.map(log => ({
          stage: log.action,
          action: log.action,
          timestamp: log.created_at,
          message: log.details,
          details: log.details
        }));
      }
    }
  } catch (dbErr: any) {
    logger.error('DB', `Database getClaimById error: ${dbErr.message}`);
  }

  // Fallback local JSON cache has been removed to ensure strictly Supabase DB

  return claimData;
};
