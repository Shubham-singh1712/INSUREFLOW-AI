export const CLAIM_STATUSES = [
  'PROCESSING',
  'VALIDATION_REQUIRED',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
] as const;

export type CanonicalClaimStatus = (typeof CLAIM_STATUSES)[number];
export type CanonicalRepairStatus = 'clean' | 'repairs_pending';

const LEGACY_STATUS_MAP: Record<string, CanonicalClaimStatus> = {
  UPLOADED: 'PROCESSING',
  OCR_COMPLETE: 'PROCESSING',
  CLASSIFIED: 'PROCESSING',
  EXTRACTED: 'PROCESSING',
  AI_PROCESSING: 'PROCESSING',
  PROCESSING: 'PROCESSING',
  REVIEW_REQUIRED: 'VALIDATION_REQUIRED',
  REPAIRS_PENDING: 'VALIDATION_REQUIRED',
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  READY: 'READY_TO_SUBMIT',
  VALIDATION_COMPLETE: 'READY_TO_SUBMIT',
  READY_TO_SUBMIT: 'READY_TO_SUBMIT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

export const normalizeClaimStatus = (status?: string | null): CanonicalClaimStatus => {
  const key = String(status || '').trim().toUpperCase();
  return LEGACY_STATUS_MAP[key] || 'PROCESSING';
};

export const getRepairStatusFromClaimStatus = (
  status?: string | null
): CanonicalRepairStatus => {
  const normalizedStatus = normalizeClaimStatus(status);
  return normalizedStatus === 'PROCESSING' || normalizedStatus === 'VALIDATION_REQUIRED'
    ? 'repairs_pending'
    : 'clean';
};

export const shouldRequireManualReview = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);
  return normalizedStatus === 'PROCESSING' || normalizedStatus === 'VALIDATION_REQUIRED';
};

export const isValidationRequired = (status?: string | null) =>
  normalizeClaimStatus(status) === 'VALIDATION_REQUIRED';

export const isReadyToSubmit = (status?: string | null) =>
  normalizeClaimStatus(status) === 'READY_TO_SUBMIT';

export const isSubmitted = (status?: string | null) =>
  normalizeClaimStatus(status) === 'SUBMITTED';

export const isApproved = (status?: string | null) =>
  normalizeClaimStatus(status) === 'APPROVED';

export const isRejected = (status?: string | null) =>
  normalizeClaimStatus(status) === 'REJECTED';

export const calculateLifecycleStatus = ({
  validationIssueCount,
  readinessScore,
  threshold,
}: {
  validationIssueCount: number;
  readinessScore: number;
  threshold: number;
}): CanonicalClaimStatus => {
  if (validationIssueCount > 0) {
    return 'VALIDATION_REQUIRED';
  }

  if (readinessScore >= threshold) {
    return 'READY_TO_SUBMIT';
  }

  return 'VALIDATION_REQUIRED';
};

export const getClaimStatusLabel = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);

  if (normalizedStatus === 'PROCESSING') return 'AI Processing';
  if (normalizedStatus === 'VALIDATION_REQUIRED') return 'Validation Required';
  if (normalizedStatus === 'READY_TO_SUBMIT') return 'Ready to Submit';
  if (normalizedStatus === 'SUBMITTED') return 'Submitted';
  if (normalizedStatus === 'APPROVED') return 'Approved';
  return 'Rejected';
};

export const getClaimStatusTone = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);

  if (normalizedStatus === 'APPROVED' || normalizedStatus === 'READY_TO_SUBMIT') {
    return 'success' as const;
  }

  if (normalizedStatus === 'REJECTED') {
    return 'danger' as const;
  }

  if (normalizedStatus === 'VALIDATION_REQUIRED') {
    return 'warning' as const;
  }

  return 'info' as const;
};
