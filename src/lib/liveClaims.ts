import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { calculateExtractionConfidence, type ExtractedClaimData } from './claims';
import type { ClaimRegisterRow, DashboardClaim, DashboardMetric } from './demoData';

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
  status: 'submitted' | 'ready' | 'repairs_pending' | 'approved' | 'rejected';
  repairStatus: DashboardClaim['repairStatus'];
  submittedAt: string;
  confirmedData: ExtractedClaimData;
  reviewReasons?: string[];
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

const normalizeIdentityPart = (value?: string) => value?.toLowerCase().replace(/[^a-z0-9]/g, '');

const claimIdentityKey = (data: ExtractedClaimData) => {
  const patient = normalizeIdentityPart(data.patient.full_name);
  const memberId = normalizeIdentityPart(data.insurance.member_id);
  const dob = normalizeIdentityPart(data.patient.date_of_birth);
  const admissionDate = normalizeIdentityPart(data.clinical.admission_date);
  const total = normalizeIdentityPart(data.billing.total_billed_amount);

  if (memberId) {
    return ['member', memberId, admissionDate, total].filter(Boolean).join(':');
  }

  if (patient && dob) {
    return ['patient-dob', patient, dob, admissionDate, total].filter(Boolean).join(':');
  }

  if (patient && admissionDate && total) {
    return ['patient-episode', patient, admissionDate, total].join(':');
  }

  return null;
};

const dedupeClaimsByIdentity = (claims: LiveClaim[]) => {
  const seen = new Set<string>();

  return claims.filter((claim) => {
    const key = claimIdentityKey(claim.confirmedData);
    if (!key) return true;

    const scopedKey = `${claim.userId}:${key}`;
    if (seen.has(scopedKey)) return false;

    seen.add(scopedKey);
    return true;
  });
};

export const listLiveClaims = async (userId?: string | null) => {
  const claims = dedupeClaimsByIdentity((await readAllClaims()).map(normalizeStoredClaim));
  return userId ? claims.filter((claim) => claim.userId === userId) : claims;
};

export const getLiveClaim = async (userId: string, claimId: string) => {
  const claims = (await readAllClaims()).map(normalizeStoredClaim);
  return claims.find((claim) => claim.userId === userId && claim.claimId === claimId) ?? null;
};

const patientName = (data: ExtractedClaimData) => data.patient.full_name || 'Unknown Patient';

const tpaName = (data: ExtractedClaimData) =>
  data.insurance.plan_name || data.insurance.payer_id || 'Unknown TPA';

const claimAmount = (data: ExtractedClaimData) => {
  const amount = Number.parseInt(data.billing.total_billed_amount || '0', 10);
  return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : 'INR 0';
};

const matchingIdentityClaim = (
  claims: LiveClaim[],
  userId: string,
  confirmedData: ExtractedClaimData
) => {
  const key = claimIdentityKey(confirmedData);
  if (!key) return null;

  return (
    claims.find(
      (claim) => claim.userId === userId && claimIdentityKey(claim.confirmedData) === key
    ) ?? null
  );
};

const replacementWithoutClaim = (
  claims: LiveClaim[],
  userId: string,
  claimId: string,
  confirmedData: ExtractedClaimData
) => {
  const key = claimIdentityKey(confirmedData);

  return claims.filter((claim) => {
    if (claim.userId !== userId) return true;
    if (claim.claimId === claimId) return false;
    return !key || claimIdentityKey(claim.confirmedData) !== key;
  });
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
  const existingClaim = matchingIdentityClaim(claims, userId, confirmedData);
  const resolvedClaimId = existingClaim?.claimId || claimId;
  const liveClaim: LiveClaim = {
    id: resolvedClaimId,
    userId,
    claimId: resolvedClaimId,
    patient: patientName(confirmedData),
    tpa: tpaName(confirmedData),
    amount: claimAmount(confirmedData),
    aiConfidence: confidencePercent(confirmedData),
    submissionScore: 96,
    documentsTotal: 6,
    documentsPassed: 6,
    status: 'submitted',
    repairStatus: 'clean',
    submittedAt: new Date().toISOString(),
    confirmedData,
  };

  const nextClaims = [
    liveClaim,
    ...replacementWithoutClaim(claims, userId, claimId, confirmedData),
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
  const existingClaim = matchingIdentityClaim(claims, userId, confirmedData);
  const resolvedClaimId = existingClaim?.claimId || claimId;
  const aiConfidence = confidencePercent(confirmedData);
  const liveClaim: LiveClaim = {
    id: resolvedClaimId,
    userId,
    claimId: resolvedClaimId,
    patient: patientName(confirmedData),
    tpa: tpaName(confirmedData),
    amount: claimAmount(confirmedData),
    aiConfidence,
    submissionScore: Math.max(0, Math.min(100, aiConfidence - 20)),
    documentsTotal: 6,
    documentsPassed: Math.max(0, 6 - (reviewReasons?.length || 1)),
    status: 'repairs_pending',
    repairStatus: 'repairs_pending',
    submittedAt: new Date().toISOString(),
    confirmedData,
    reviewReasons,
  };

  const nextClaims = [
    liveClaim,
    ...replacementWithoutClaim(claims, userId, claimId, confirmedData),
  ];
  await writeAllClaims(nextClaims);
  return liveClaim;
};

export const submitReadyClaims = async (userId: string) => {
  const claims = await readAllClaims();
  const submittedAt = new Date().toISOString();
  let submitted = 0;

  const nextClaims = claims.map((claim) => {
    if (claim.userId !== userId || claim.status !== 'ready' || claim.repairStatus !== 'clean') {
      return claim;
    }

    submitted += 1;
    return {
      ...claim,
      status: 'submitted' as const,
      submittedAt,
    };
  });

  await writeAllClaims(nextClaims);

  return {
    submitted,
    queued: nextClaims.filter((claim) => claim.userId === userId && claim.status === 'submitted')
      .length,
  };
};

const ageFromDob = (dob?: string) => {
  if (!dob) return 0;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
};

export const toDashboardClaims = (claims: LiveClaim[]): DashboardClaim[] =>
  claims.map((claim) => ({
    id: claim.id,
    claimId: claim.claimId,
    patient: claim.patient,
    age: ageFromDob(claim.confirmedData.patient.date_of_birth),
    tpa: claim.tpa,
    documents: { total: claim.documentsTotal, passed: claim.documentsPassed },
    aiConfidence: claim.aiConfidence,
    repairStatus: claim.repairStatus,
    submissionScore: claim.submissionScore,
    amount: claim.amount,
    admissionDate: claim.confirmedData.clinical.admission_date || claim.submittedAt.slice(0, 10),
    status: claim.status,
  }));

export const toClaimRegisterRows = (claims: LiveClaim[]): ClaimRegisterRow[] =>
  claims.map((claim) => ({
    id: claim.claimId,
    patient: claim.patient,
    tpa: claim.tpa,
    issue: claim.repairStatus === 'clean' ? 'Clean packet submitted' : 'Needs validation review',
    score: String(claim.submissionScore),
    status:
      claim.status === 'submitted'
        ? 'Queued'
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
      patient: {
        full_name: claim.patient,
        date_of_birth: '1970-01-01',
        gender: '',
        address: '',
        contact_phone: '',
        contact_email: '',
      },
      insurance: {
        policyholder_name: '',
        group_number: '',
        member_id: '',
        payer_id: '',
        plan_name: claim.tpa,
      },
      pre_authorization: {
        approval_code: '',
        authorized_from: '',
        authorized_to: '',
      },
      clinical: {
        admission_date: claim.admissionDate,
        discharge_date: '',
        attending_physician: '',
        hospital_npi: '',
        hospital_tax_id: '',
        facility_name: '',
        principal_diagnosis: '',
      },
      coding: {
        icd10_codes: [],
        cpt_codes: [],
      },
      billing: {
        total_billed_amount: claim.amount.replace(/[^0-9]/g, ''),
        line_items: [],
      },
      extraction_meta: {
        overall_confidence: claim.aiConfidence,
        low_confidence_fields: [],
        requires_manual_review: claim.repairStatus !== 'clean',
      },
    },
  }));

export const buildLiveDashboardMetrics = (claims: LiveClaim[]): DashboardMetric[] => {
  const total = claims.length;
  const clean = claims.filter((claim) => claim.repairStatus === 'clean').length;
  const attention = claims.filter((claim) => claim.repairStatus !== 'clean').length;
  const submittedToday = claims.filter((claim) => {
    if (claim.status !== 'submitted') return false;
    const submitted = new Date(claim.submittedAt);
    const now = new Date();
    return submitted.toDateString() === now.toDateString();
  }).length;
  const avgConfidence =
    total > 0 ? Math.round(claims.reduce((sum, claim) => sum + claim.aiConfidence, 0) / total) : 0;
  const validationRate = total > 0 ? Math.round((clean / total) * 100) : 0;
  const docsProcessed = claims.reduce((sum, claim) => sum + claim.documentsTotal, 0);

  return [
    {
      id: 'metric-validation-rate',
      label: 'Validation Success Rate',
      value: `${validationRate}%`,
      change: total > 0 ? `+${validationRate}%` : '0%',
      changeDir: 'up',
      changeLabel: 'vs. yesterday',
      tone: 'success',
      highlight: true,
      description: 'Claims passing AI validation without manual repair',
      colSpan: 'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-2',
    },
    {
      id: 'metric-attention',
      label: 'Claims Requiring Attention',
      value: String(attention),
      change: '0',
      changeDir: 'up',
      changeLabel: 'since 9 AM',
      tone: attention > 0 ? 'danger' : 'success',
      alert: attention > 0,
      description: 'Unresolved repair suggestions blocking submission',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-pending',
      label: 'Pending Submissions',
      value: String(submittedToday),
      change: `+${submittedToday}`,
      changeDir: 'up',
      changeLabel: 'submitted today',
      tone: 'warning',
      description: 'Claims ready or near-ready for TPA submission',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-rejection',
      label: 'TPA Rejection Rate',
      value: '0%',
      change: '0%',
      changeDir: 'up',
      changeLabel: 'vs. last week',
      tone: 'success',
      description: 'Claims rejected after TPA submission this month',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-ocr',
      label: 'OCR Extraction Accuracy',
      value: `${avgConfidence}%`,
      change: total > 0 ? `+${avgConfidence}%` : '0%',
      changeDir: 'up',
      changeLabel: 'vs. yesterday',
      tone: 'info',
      description: 'Documents with successful text extraction',
      colSpan: 'col-span-1',
    },
    {
      id: 'metric-docs',
      label: 'Documents Processed Today',
      value: String(docsProcessed),
      change: `+${docsProcessed}`,
      changeDir: 'up',
      changeLabel: 'vs. daily avg',
      tone: 'muted',
      description: 'Total documents scanned and validated today',
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

