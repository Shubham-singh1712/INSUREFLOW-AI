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

const storePath = path.join(process.cwd(), '.data', 'live-claims.json');

async function readAllClaimsCache(): Promise<any[]> {
  try {
    return JSON.parse(await readFile(storePath, 'utf8'));
  } catch {
    return [];
  }
}

async function writeAllClaimsCache(claims: any[]) {
  try {
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(storePath, JSON.stringify(claims, null, 2), 'utf8');
  } catch (err: any) {
    logger.error('DB_CACHE', `Failed to write cache: ${err.message}`);
  }
}

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

  // Also sync to local cache
  try {
    const claims = await readAllClaimsCache();
    const claim = claims.find((c) => c.claimId === claimId);
    if (claim) {
      if (!claim.auditLogs) {
        claim.auditLogs = [];
      }
      // Prevent duplicates in short timeframes
      const lastLog = claim.auditLogs[claim.auditLogs.length - 1];
      if (!lastLog || lastLog.action !== action || lastLog.details !== details) {
        claim.auditLogs.push({
          action,
          details,
          timestamp: new Date().toISOString()
        });
        await writeAllClaimsCache(claims);
      }
    }
  } catch (cacheErr: any) {
    logger.error('DB_AUDIT', `Failed to sync audit log to cache for ${claimId}: ${cacheErr.message}`);
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
  
  // 1. Insert into Supabase
  try {
    const supabase = await createClient();
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

  // 2. Sync to local cache
  try {
    const claims = await readAllClaimsCache();
    const newClaim = {
      id: claimId,
      userId: userId,
      claimId: claimId,
      patient: 'Unknown Patient',
      tpa: 'Unknown TPA',
      amount: 'INR 0',
      aiConfidence: 0,
      submissionScore: 0,
      documentsTotal: 6,
      documentsPassed: 0,
      status: 'PROCESSING',
      repairStatus: 'repairs_pending',
      submittedAt: new Date().toISOString(),
      confirmedData: {
        patient: { full_name: '', date_of_birth: '', gender: '', address: '', contact_phone: '', contact_email: '' },
        insurance: { policyholder_name: '', group_number: '', member_id: '', payer_id: '', plan_name: '' },
        pre_authorization: { approval_code: '', authorized_from: '', authorized_to: '' },
        clinical: { admission_date: '', discharge_date: '', attending_physician: '', hospital_npi: '', hospital_tax_id: '', facility_name: '', principal_diagnosis: '' },
        coding: { icd10_codes: [], cpt_codes: [] },
        billing: { total_billed_amount: '0', line_items: [] },
        extraction_meta: { overall_confidence: 0, low_confidence_fields: [], requires_manual_review: true }
      },
      hospitalName: 'Unknown Hospital',
      claimHealth: 0,
      readiness: 0,
      rejectionRisk: 'low',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      validationCount: 0,
      repairSuggestionCount: 0,
      assignedReviewer: 'Desk Agent',
      auditLogs: []
    };
    const updated = [newClaim, ...claims.filter(c => c.claimId !== claimId)];
    await writeAllClaimsCache(updated);
  } catch (cacheErr: any) {
    logger.error('DB', `Failed to sync created claim to cache: ${cacheErr.message}`);
  }

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

  // 2. Sync to local cache
  try {
    const claims = await readAllClaimsCache();
    const existing = claims.find((c) => c.claimId === claimId);
    if (existing) {
      const uiStatus = normalizeClaimStatus(state);
      const repairStatus = getRepairStatusFromClaimStatus(uiStatus);

      // Extract patient/hospital/amount info from incoming extractedFields if present
      let patient = existing.patient;
      let tpa = existing.tpa;
      let hospitalName = existing.hospitalName || 'Unknown Hospital';
      let amount = existing.amount;
      let confirmedData = existing.confirmedData;

      if (data?.extractedFields) {
        const fields = data.extractedFields;
        patient = fields.patient?.full_name?.value || patient;
        tpa = fields.insurance?.provider_name?.value || tpa;
        hospitalName = fields.hospital?.facility_name?.value || hospitalName;
        if (fields.financial?.final_bill?.value !== undefined && fields.financial?.final_bill?.value !== null) {
          amount = `INR ${Number(fields.financial.final_bill.value).toLocaleString('en-IN')}`;
        }
        
        confirmedData = {
          patient: {
            full_name: fields.patient?.full_name?.value || confirmedData.patient.full_name,
            date_of_birth: fields.patient?.dob?.value || confirmedData.patient.date_of_birth,
            gender: fields.patient?.gender?.value || confirmedData.patient.gender,
            address: fields.patient?.address?.value || confirmedData.patient.address,
            contact_phone: fields.patient?.phone?.value || confirmedData.patient.contact_phone,
            contact_email: confirmedData.patient.contact_email,
          },
          insurance: {
            policyholder_name: confirmedData.insurance.policyholder_name,
            group_number: fields.insurance?.corporate_or_group_id?.value || confirmedData.insurance.group_number,
            member_id: fields.insurance?.member_id?.value || confirmedData.insurance.member_id,
            payer_id: fields.insurance?.insurance_id?.value || confirmedData.insurance.payer_id,
            plan_name: fields.insurance?.provider_name?.value || confirmedData.insurance.plan_name,
          },
          pre_authorization: confirmedData.pre_authorization,
          clinical: {
            admission_date: fields.hospital?.admission_date?.value || confirmedData.clinical.admission_date,
            discharge_date: fields.hospital?.discharge_date?.value || confirmedData.clinical.discharge_date,
            attending_physician: fields.hospital?.doctor_name?.value || confirmedData.clinical.attending_physician,
            hospital_npi: confirmedData.clinical.hospital_npi,
            hospital_tax_id: confirmedData.clinical.hospital_tax_id,
            facility_name: fields.hospital?.facility_name?.value || confirmedData.clinical.facility_name,
            principal_diagnosis: fields.clinical?.diagnosis?.value || confirmedData.clinical.principal_diagnosis,
          },
          coding: {
            icd10_codes: (() => {
              const val = fields.clinical?.icd10_codes?.value;
              if (Array.isArray(val)) {
                return val.map((code: any) => ({
                  code: typeof code === 'object' && code !== null ? String(code.code || '') : String(code),
                  description: typeof code === 'object' && code !== null ? String(code.description || '') : '',
                  confidence: typeof code === 'object' && code !== null && typeof code.confidence === 'number' ? code.confidence : 100
                }));
              }
              if (typeof val === 'string') {
                return (val as any).split(',').map((s: string) => s.trim()).filter(Boolean).map((code: string) => ({
                  code, description: '', confidence: 100
                }));
              }
              return [];
            })(),
            cpt_codes: confirmedData.coding.cpt_codes,
          },
          billing: {
            total_billed_amount: fields.financial?.final_bill?.value 
              ? String(fields.financial.final_bill.value)
              : confirmedData.billing.total_billed_amount,
            line_items: confirmedData.billing.line_items,
          },
          extraction_meta: {
            overall_confidence: data.ocrConfidence || confirmedData.extraction_meta.overall_confidence,
            low_confidence_fields: confirmedData.extraction_meta.low_confidence_fields,
            requires_manual_review: shouldRequireManualReview(uiStatus),
          }
        };
      }

      const updatedClaim = {
        ...existing,
        status: uiStatus,
        repairStatus: repairStatus,
        patient,
        tpa,
        hospitalName,
        amount,
        confirmedData,
        updatedAt: new Date().toISOString(),
        ...(data?.claimHealth !== undefined && { claimHealth: data.claimHealth, aiConfidence: data.claimHealth }),
        ...(data?.readiness !== undefined && { readiness: data.readiness, submissionScore: data.readiness }),
        ...(data?.ocrConfidence !== undefined && { ocrConfidence: data.ocrConfidence }),
        ...(data?.validationErrors && {
          validationCount: data.validationErrors.length,
          reviewReasons: data.validationErrors.map((e) => e.issue),
          documentsPassed: Math.max(0, 6 - data.validationErrors.length)
        }),
        ...(data?.repairSuggestions && { repairSuggestionCount: data.repairSuggestions.length }),
        ...(data?.rejectionRisk && { rejectionRisk: data.rejectionRisk })
      };

      const updatedClaims = claims.map((c) => (c.claimId === claimId ? updatedClaim : c));
      await writeAllClaimsCache(updatedClaims);
    }
  } catch (cacheErr: any) {
    logger.error('DB', `Failed to sync claim state to cache: ${cacheErr.message}`);
  }

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

  // 2. Fall back to Cache if Supabase fails or doesn't have it
  if (!claimData) {
    logger.info('DB', `Falling back to local cache for claim ${claimId}`);
    try {
      const claims = await readAllClaimsCache();
      const cached = claims.find((c) => c.claimId === claimId);
      if (cached) {
        claimData = {
          id: cached.id,
          user_id: cached.userId,
          upload_session_id: cached.claimId,
          file_name: cached.confirmedData?.patient?.full_name ? `${cached.confirmedData.patient.full_name}.pdf` : 'claim.pdf',
          file_size: 1024 * 1024,
          status: normalizeClaimStatus(cached.status),
          created_at: cached.submittedAt,
          updated_at: cached.updatedAt || cached.submittedAt,
          extracted_data: cached.confirmedData ? {
            patient: {
              full_name: { value: cached.confirmedData.patient?.full_name || '', confidence: 100, page: 1 },
              dob: { value: cached.confirmedData.patient?.date_of_birth || '', confidence: 100, page: 1 },
              gender: { value: cached.confirmedData.patient?.gender || '', confidence: 100, page: 1 },
              phone: { value: cached.confirmedData.patient?.contact_phone || '', confidence: 100, page: 1 },
              address: { value: cached.confirmedData.patient?.address || '', confidence: 100, page: 1 }
            },
            insurance: {
              provider_name: { value: cached.confirmedData.insurance?.plan_name || '', confidence: 100, page: 1 },
              member_id: { value: cached.confirmedData.insurance?.member_id || '', confidence: 100, page: 1 },
              corporate_or_group_id: { value: cached.confirmedData.insurance?.group_number || '', confidence: 100, page: 1 },
              insurance_id: { value: cached.confirmedData.insurance?.payer_id || '', confidence: 100, page: 1 }
            },
            hospital: {
              facility_name: { value: cached.confirmedData.clinical?.facility_name || '', confidence: 100, page: 1 },
              doctor_name: { value: cached.confirmedData.clinical?.attending_physician || '', confidence: 100, page: 1 },
              admission_date: { value: cached.confirmedData.clinical?.admission_date || '', confidence: 100, page: 1 },
              discharge_date: { value: cached.confirmedData.clinical?.discharge_date || '', confidence: 100, page: 1 }
            },
            clinical: {
              diagnosis: { value: cached.confirmedData.clinical?.principal_diagnosis || '', confidence: 100, page: 1 },
              icd10_codes: { value: (cached.confirmedData.coding?.icd10_codes || []).map((c: any) => c.code), confidence: 100, page: 1 }
            },
            financial: {
              final_bill: { value: Number(cached.confirmedData.billing?.total_billed_amount || 0), confidence: 100, page: 1 }
            },
            authorization: {
              hospital_seal: { value: true, confidence: 100, page: 1 },
              patient_signature: { value: true, confidence: 100, page: 1 },
              doctor_signature: { value: true, confidence: 100, page: 1 }
            }
          } : {},
          health_score: cached.claimHealth || cached.aiConfidence || 0,
          readiness_score: cached.readiness || cached.submissionScore || 0,
          ocr_confidence: cached.aiConfidence || 0,
          validation_errors: cached.reviewReasons?.map((r: string) => ({ field: 'general', issue: r, severity: 'medium', pages: [] })) || [],
          audit_logs: cached.auditLogs?.map((l: any) => ({
            stage: l.action,
            action: l.action,
            timestamp: l.timestamp,
            message: l.details,
            details: l.details
          })) || []
        };
      }
    } catch (cacheErr: any) {
      logger.error('DB', `Failed to read fallback cache for ${claimId}: ${cacheErr.message}`);
    }
  }

  return claimData;
};
