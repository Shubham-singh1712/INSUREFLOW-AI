import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { calculateExtractionConfidence, type ExtractedClaimData } from './claims';
import type { ClaimRegisterRow, DashboardClaim, DashboardMetric } from './demoData';
import { createClient } from '@/lib/supabase/server';
import { saveClaimState, addAuditLog } from '@/lib/claim-processing/db';
import { logger } from './claim-processing/logger';

export type LiveClaim = {
  id: string;
  userId: string;
  claimId: string;
  patient: string;
  tpa: string;
  amount: string;
  aiConfidence: number;
  submissionScore: number;
  documentsTotal: number;
  documentsPassed: number;
  status: 'ai_processing' | 'submitted' | 'ready' | 'repairs_pending' | 'approved' | 'rejected';
  repairStatus: DashboardClaim['repairStatus'];
  submittedAt: string;
  confirmedData: ExtractedClaimData;
  reviewReasons?: string[];
  hospitalName?: string;
  claimHealth?: number;
  readiness?: number;
  rejectionRisk?: 'low' | 'medium' | 'high';
  createdAt?: string;
  updatedAt?: string;
  validationCount?: number;
  repairSuggestionCount?: number;
  assignedReviewer?: string;
  auditLogs?: Array<{ action: string; details?: string; timestamp: string }>;
};

const storePath = path.join(process.cwd(), '.data', 'live-claims.json');

const readAllClaims = async (): Promise<LiveClaim[]> => {
  try {
    return JSON.parse(await readFile(storePath, 'utf8')) as LiveClaim[];
  } catch {
    return [];
  }
};

const writeAllClaims = async (claims: LiveClaim[]) => {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(claims, null, 2), 'utf8');
};

const confidencePercent = (data: ExtractedClaimData) =>
  Math.max(0, Math.min(100, Math.round(calculateExtractionConfidence(data))));

const normalizeStoredClaim = (claim: LiveClaim): LiveClaim => ({
  ...claim,
  aiConfidence: confidencePercent(claim.confirmedData),
});

const mapDbClaimToLiveClaim = (dbClaim: any): LiveClaim => {
  try {
    const ext = (typeof dbClaim.extracted_data === 'string' ? JSON.parse(dbClaim.extracted_data) : dbClaim.extracted_data) || {};
    const valErrors = Array.isArray(dbClaim.validation_errors)
      ? dbClaim.validation_errors
      : typeof dbClaim.validation_errors === 'string'
        ? JSON.parse(dbClaim.validation_errors)
        : [];
    const repSuggestions = Array.isArray(dbClaim.repair_suggestions)
      ? dbClaim.repair_suggestions
      : typeof dbClaim.repair_suggestions === 'string'
        ? JSON.parse(dbClaim.repair_suggestions)
        : [];
    const classPages = Array.isArray(dbClaim.classified_pages)
      ? dbClaim.classified_pages
      : typeof dbClaim.classified_pages === 'string'
        ? JSON.parse(dbClaim.classified_pages)
        : [];

    let icdCodes: any[] = [];
    if (ext.clinical?.icd10_codes?.value) {
      if (Array.isArray(ext.clinical.icd10_codes.value)) {
        icdCodes = ext.clinical.icd10_codes.value.map((code: any) => ({
          code: typeof code === 'object' && code !== null ? code.code || '' : String(code),
          description: typeof code === 'object' && code !== null ? code.description || '' : '',
          confidence: typeof code === 'object' && code !== null ? code.confidence || 100 : 100
        }));
      } else if (typeof ext.clinical.icd10_codes.value === 'string') {
        icdCodes = [{ code: ext.clinical.icd10_codes.value, description: '', confidence: 100 }];
      }
    }

    const claimHealth = dbClaim.health_score !== undefined && dbClaim.health_score !== null ? Number(dbClaim.health_score) : 0;
    const readiness = dbClaim.readiness_score !== undefined && dbClaim.readiness_score !== null ? Number(dbClaim.readiness_score) : 0;
    const ocrConfidence = dbClaim.ocr_confidence !== undefined && dbClaim.ocr_confidence !== null ? Number(dbClaim.ocr_confidence) : 0;

    let finalBillStr = '0';
    if (ext.financial?.final_bill?.value !== undefined && ext.financial?.final_bill?.value !== null) {
      finalBillStr = String(ext.financial.final_bill.value).replace(/[^0-9.]/g, '');
    }
    const finalBillNum = parseFloat(finalBillStr) || 0;

    // Map ClaimState to UI status
    let uiStatus: any = 'ai_processing';
    const state = dbClaim.status || 'UPLOADED';
    if (state === 'REVIEW_REQUIRED') uiStatus = 'repairs_pending';
    else if (state === 'READY') uiStatus = 'ready';
    else if (state === 'SUBMITTED') uiStatus = 'submitted';
    else if (state === 'APPROVED') uiStatus = 'approved';
    else if (state === 'REJECTED') uiStatus = 'rejected';

    let repairStatus: any = 'repairs_pending';
    if (state === 'READY' || state === 'APPROVED' || state === 'SUBMITTED') {
      repairStatus = 'clean';
    }

    // Safely reconstruct audit logs
    const auditLogs: any[] = [];
    const dbAuditLogs = dbClaim.audit_logs || [];
    if (Array.isArray(dbAuditLogs)) {
      dbAuditLogs.forEach((log: any) => {
        if (log) {
          auditLogs.push({
            action: log.action || log.stage || 'Log',
            details: log.details || log.message || '',
            timestamp: log.timestamp || log.created_at || new Date().toISOString()
          });
        }
      });
    }

    return {
      id: dbClaim.id,
      userId: dbClaim.user_id || 'unknown',
      claimId: dbClaim.id,
      patient: dbClaim.patient_name || ext.patient?.full_name?.value || 'Unknown Patient',
      tpa: ext.insurance?.provider_name?.value || 'Unknown TPA',
      amount: finalBillNum > 0 ? `INR ${finalBillNum.toLocaleString('en-IN')}` : 'INR 0',
      aiConfidence: claimHealth || ocrConfidence || 0,
      submissionScore: readiness || 0,
      documentsTotal: 6,
      documentsPassed: Math.max(0, 6 - valErrors.length),
      status: uiStatus,
      repairStatus: repairStatus,
      submittedAt: dbClaim.updated_at || dbClaim.created_at || new Date().toISOString(),
      confirmedData: {
        patient: {
          full_name: ext.patient?.full_name?.value || '',
          date_of_birth: ext.patient?.dob?.value || '',
          gender: ext.patient?.gender?.value || '',
          address: ext.patient?.address?.value || '',
          contact_phone: ext.patient?.phone?.value || '',
          contact_email: '',
        },
        insurance: {
          policyholder_name: '',
          group_number: ext.insurance?.corporate_or_group_id?.value || '',
          member_id: ext.insurance?.member_id?.value || '',
          payer_id: ext.insurance?.insurance_id?.value || '',
          plan_name: ext.insurance?.provider_name?.value || '',
        },
        pre_authorization: { approval_code: '', authorized_from: '', authorized_to: '' },
        clinical: {
          admission_date: ext.hospital?.admission_date?.value || '',
          discharge_date: ext.hospital?.discharge_date?.value || '',
          attending_physician: ext.hospital?.doctor_name?.value || '',
          hospital_npi: '',
          hospital_tax_id: '',
          facility_name: ext.hospital?.facility_name?.value || '',
          principal_diagnosis: ext.clinical?.diagnosis?.value || '',
        },
        coding: {
          icd10_codes: icdCodes,
          cpt_codes: [],
        },
        billing: {
          total_billed_amount: String(finalBillNum),
          line_items: [],
        },
        extraction_meta: {
          overall_confidence: ocrConfidence || 90,
          low_confidence_fields: [],
          requires_manual_review: state !== 'READY',
        }
      },
      reviewReasons: valErrors.map((e: any) => e.issue || 'Issue detected'),
      hospitalName: dbClaim.hospital_name || ext.hospital?.facility_name?.value || 'Unknown Hospital',
      claimHealth,
      readiness,
      rejectionRisk: dbClaim.rejection_risk || 'low',
      createdAt: dbClaim.created_at || new Date().toISOString(),
      updatedAt: dbClaim.updated_at || new Date().toISOString(),
      validationCount: valErrors.length,
      repairSuggestionCount: repSuggestions.length,
      assignedReviewer: dbClaim.assigned_reviewer || 'Desk Agent',
      auditLogs
    };
  } catch (err: any) {
    logger.error('MAP_DB_CLAIM', `Error mapping claim row ${dbClaim?.id}: ${err.message}`);
    return {
      id: dbClaim?.id || 'unknown',
      userId: dbClaim?.user_id || 'unknown',
      claimId: dbClaim?.id || 'unknown',
      patient: dbClaim?.patient_name || 'Unknown Patient',
      tpa: 'Unknown TPA',
      amount: 'INR 0',
      aiConfidence: 0,
      submissionScore: 0,
      documentsTotal: 6,
      documentsPassed: 6,
      status: 'ai_processing',
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
      }
    };
  }
};

export const listLiveClaims = async (userId?: string | null): Promise<LiveClaim[]> => {
  // 1. Try Supabase
  try {
    const supabase = await createClient();
    let query = supabase.from('claims').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) {
      return data.map(mapDbClaimToLiveClaim);
    }
  } catch (err: any) {
    console.error('Supabase listLiveClaims failed, falling back to cache:', err.message);
  }

  // 2. Fall back to local JSON file
  const claims = (await readAllClaims()).map(normalizeStoredClaim);
  return userId ? claims.filter((claim) => claim.userId === userId) : claims;
};

export const getLiveClaim = async (userId: string, claimId: string): Promise<LiveClaim | null> => {
  // 1. Try Supabase
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      return mapDbClaimToLiveClaim(data);
    }
  } catch (err: any) {
    console.error('Supabase getLiveClaim failed, falling back to cache:', err.message);
  }

  // 2. Fall back to local JSON
  const claims = (await readAllClaims()).map(normalizeStoredClaim);
  return claims.find((claim) => claim.userId === userId && claim.claimId === claimId) ?? null;
};

export const saveSubmittedClaim = async ({
  userId,
  claimId,
  confirmedData,
}: {
  userId: string;
  claimId: string;
  confirmedData: ExtractedClaimData;
}) => {
  const claims = await readAllClaims();
  const existingClaim = claims.find(c => c.claimId === claimId);
  const resolvedClaimId = existingClaim?.claimId || claimId;
  const liveClaim: LiveClaim = {
    id: resolvedClaimId,
    userId,
    claimId: resolvedClaimId,
    patient: confirmedData.patient.full_name || 'Unknown Patient',
    tpa: confirmedData.insurance.plan_name || 'Unknown TPA',
    amount: confirmedData.billing.total_billed_amount 
      ? `INR ${Number(confirmedData.billing.total_billed_amount).toLocaleString('en-IN')}`
      : 'INR 0',
    aiConfidence: confidencePercent(confirmedData),
    submissionScore: 96,
    documentsTotal: 6,
    documentsPassed: 6,
    status: 'submitted',
    repairStatus: 'clean',
    submittedAt: new Date().toISOString(),
    confirmedData,
    hospitalName: confirmedData.clinical.facility_name || 'Unknown Hospital',
    claimHealth: confidencePercent(confirmedData),
    readiness: 96,
    rejectionRisk: 'low',
    createdAt: existingClaim?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    validationCount: 0,
    repairSuggestionCount: 0,
    assignedReviewer: 'Desk Agent',
    auditLogs: existingClaim?.auditLogs || []
  };

  const nextClaims = [
    liveClaim,
    ...claims.filter(c => c.claimId !== claimId)
  ];
  await writeAllClaims(nextClaims);
  return liveClaim;
};

export const saveReviewClaim = async ({
  userId,
  claimId,
  confirmedData,
  reviewReasons,
}: {
  userId: string;
  claimId: string;
  confirmedData: ExtractedClaimData;
  reviewReasons?: string[];
}) => {
  const claims = await readAllClaims();
  const existingClaim = claims.find(c => c.claimId === claimId);
  const resolvedClaimId = existingClaim?.claimId || claimId;
  const aiConfidence = confidencePercent(confirmedData);
  const liveClaim: LiveClaim = {
    id: resolvedClaimId,
    userId,
    claimId: resolvedClaimId,
    patient: confirmedData.patient.full_name || 'Unknown Patient',
    tpa: confirmedData.insurance.plan_name || 'Unknown TPA',
    amount: confirmedData.billing.total_billed_amount 
      ? `INR ${Number(confirmedData.billing.total_billed_amount).toLocaleString('en-IN')}`
      : 'INR 0',
    aiConfidence,
    submissionScore: Math.max(0, Math.min(100, aiConfidence - 20)),
    documentsTotal: 6,
    documentsPassed: Math.max(0, 6 - (reviewReasons?.length || 1)),
    status: (reviewReasons && reviewReasons.length === 0) ? 'ready' : 'repairs_pending',
    repairStatus: (reviewReasons && reviewReasons.length === 0) ? 'clean' : 'repairs_pending',
    submittedAt: new Date().toISOString(),
    confirmedData,
    reviewReasons,
    hospitalName: confirmedData.clinical.facility_name || 'Unknown Hospital',
    claimHealth: aiConfidence,
    readiness: Math.max(0, Math.min(100, aiConfidence - 20)),
    rejectionRisk: (reviewReasons && reviewReasons.length > 3) ? 'high' : (reviewReasons && reviewReasons.length > 0) ? 'medium' : 'low',
    createdAt: existingClaim?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    validationCount: reviewReasons?.length || 0,
    repairSuggestionCount: reviewReasons?.length || 0,
    assignedReviewer: 'Desk Agent',
    auditLogs: existingClaim?.auditLogs || []
  };

  const nextClaims = [
    liveClaim,
    ...claims.filter(c => c.claimId !== claimId)
  ];
  await writeAllClaims(nextClaims);
  return liveClaim;
};

export const submitReadyClaims = async (userId: string) => {
  // 1. Update Supabase claims that are READY
  try {
    const supabase = await createClient();
    const { data: readyClaims } = await supabase
      .from('claims')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'READY');

    if (readyClaims && readyClaims.length > 0) {
      for (const rc of readyClaims) {
        await saveClaimState(rc.id, 'SUBMITTED');
      }
    }
  } catch (err: any) {
    console.error('Supabase submitReadyClaims failed:', err.message);
  }

  // 2. Update local cache
  const claims = await readAllClaims();
  const submittedAt = new Date().toISOString();
  let submitted = 0;

  const nextClaims = claims.map((claim) => {
    if (claim.userId !== userId || claim.status !== 'ready' || claim.repairStatus !== 'clean') {
      return claim;
    }

    submitted += 1;
    
    const updatedLogs = [...(claim.auditLogs || [])];
    updatedLogs.push({
      action: 'Claim Submitted',
      details: 'Claim submitted to TPA queue via batch run.',
      timestamp: submittedAt
    });

    return {
      ...claim,
      status: 'submitted' as const,
      submittedAt,
      auditLogs: updatedLogs
    };
  });

  await writeAllClaims(nextClaims);

  return {
    submitted,
    queued: nextClaims.filter((claim) => claim.userId === userId && claim.status === 'submitted')
      .length,
  };
};

export const toDashboardClaims = (claims: LiveClaim[]): DashboardClaim[] =>
  claims.map((claim) => ({
    id: claim.id,
    claimId: claim.claimId,
    patient: claim.patient,
    age: claim.confirmedData.patient.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(claim.confirmedData.patient.date_of_birth).getFullYear()) : 35,
    tpa: claim.tpa,
    documents: { total: claim.documentsTotal, passed: claim.documentsPassed },
    aiConfidence: claim.claimHealth || claim.aiConfidence,
    repairStatus: claim.repairStatus,
    submissionScore: claim.readiness || claim.submissionScore,
    amount: claim.amount,
    admissionDate: claim.confirmedData.clinical.admission_date || claim.submittedAt.slice(0, 10),
    status: claim.status as any,
  }));

export const toClaimRegisterRows = (claims: LiveClaim[]): ClaimRegisterRow[] =>
  claims.map((claim) => ({
    id: claim.claimId,
    patient: claim.patient,
    tpa: claim.tpa,
    issue: claim.repairStatus === 'clean' ? 'Clean packet submitted' : 'Needs validation review',
    score: String(claim.readiness || claim.submissionScore),
    status:
      claim.status === 'submitted'
        ? 'Queued'
        : claim.status === 'approved'
          ? 'Ready'
          : claim.repairStatus === 'clean'
            ? 'Ready'
            : 'Needs Repair',
  }));

export const toLiveClaimsFromDemo = (claims: DashboardClaim[], userId: string): LiveClaim[] =>
  claims.map((claim) => ({
    id: claim.id,
    userId,
    claimId: claim.claimId,
    patient: claim.patient,
    tpa: claim.tpa,
    amount: claim.amount,
    aiConfidence: claim.aiConfidence,
    submissionScore: claim.submissionScore,
    documentsTotal: claim.documents.total,
    documentsPassed: claim.documents.passed,
    status: claim.status as any,
    repairStatus: claim.repairStatus,
    submittedAt: new Date().toISOString(),
    confirmedData: {
      patient: { full_name: claim.patient, date_of_birth: '1970-01-01', gender: '', address: '', contact_phone: '', contact_email: '' },
      insurance: { policyholder_name: '', group_number: '', member_id: '', payer_id: '', plan_name: claim.tpa },
      pre_authorization: { approval_code: '', authorized_from: '', authorized_to: '' },
      clinical: { admission_date: claim.admissionDate, discharge_date: '', attending_physician: '', hospital_npi: '', hospital_tax_id: '', facility_name: '', principal_diagnosis: '' },
      coding: { icd10_codes: [], cpt_codes: [] },
      billing: { total_billed_amount: claim.amount.replace(/[^0-9]/g, ''), line_items: [] },
      extraction_meta: { overall_confidence: claim.aiConfidence, low_confidence_fields: [], requires_manual_review: claim.repairStatus !== 'clean' },
    },
  }));

export const buildLiveDashboardMetrics = (claims: LiveClaim[]): DashboardMetric[] => {
  const total = claims.length;
  const pendingReview = claims.filter((claim) => claim.status === 'repairs_pending').length;
  const submitted = claims.filter((claim) => claim.status === 'submitted').length;
  const approved = claims.filter((claim) => claim.status === 'approved').length;
  const rejected = claims.filter((claim) => claim.status === 'rejected').length;

  const avgHealth =
    total > 0
      ? Math.round(
          claims.reduce((sum, claim) => sum + (claim.claimHealth || claim.aiConfidence || 0), 0) / total
        )
      : 0;

  return [
    {
      id: 'metric-validation-rate',
      label: 'Approved Claims',
      value: String(approved),
      change: `+${approved}`,
      changeDir: 'up',
      changeLabel: 'TPA approved cases',
      tone: 'success',
      highlight: true,
      description: 'Total claims successfully approved by TPAs',
      colSpan: 'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-2',
    },
    {
      id: 'metric-attention',
      label: 'Pending Review',
      value: String(pendingReview),
      change: String(pendingReview),
      changeDir: pendingReview > 0 ? 'down' : 'up',
      changeLabel: 'Needs action',
      tone: pendingReview > 0 ? 'danger' : 'success',
      alert: pendingReview > 0,
      description: 'Claims with validation issues blocking submission',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-pending',
      label: 'Submitted Claims',
      value: String(submitted),
      change: `+${submitted}`,
      changeDir: 'up',
      changeLabel: 'In TPA queue',
      tone: 'warning',
      description: 'Claims submitted and waiting for TPA response',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-rejection',
      label: 'Rejected Claims',
      value: String(rejected),
      change: String(rejected),
      changeDir: rejected > 0 ? 'down' : 'up',
      changeLabel: 'Failed validation',
      tone: rejected > 0 ? 'danger' : 'success',
      description: 'Claims rejected by TPAs due to unresolved issues',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-ocr',
      label: 'Average Claim Health',
      value: `${avgHealth}%`,
      change: `${avgHealth}%`,
      changeDir: 'up',
      changeLabel: 'All processed claims',
      tone: 'info',
      description: 'Average AI validation confidence across all claims',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-docs',
      label: 'Total Claims',
      value: String(total),
      change: `+${total}`,
      changeDir: 'up',
      changeLabel: 'Live records',
      tone: 'muted',
      description: 'Total claim packets uploaded to InsureFlow AI',
      colSpan: 'col-span-1',
    },
  ];
};

export const updateLiveClaimStatus = async (
  userId: string,
  claimId: string,
  status: LiveClaim['status']
) => {
  const claims = await readAllClaims();
  const nextClaims = claims.map((claim) => {
    if (claim.userId === userId && claim.claimId === claimId) {
      return { ...claim, status };
    }
    return claim;
  });
  await writeAllClaims(nextClaims);
};
