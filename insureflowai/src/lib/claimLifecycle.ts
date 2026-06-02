export const CLAIM_STATUSES = [
  'PROCESSING',
  'UNDER_REVIEW',
  'READY_FOR_SUBMISSION',
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
  REVIEW_REQUIRED: 'UNDER_REVIEW',
  REPAIRS_PENDING: 'UNDER_REVIEW',
  VALIDATION_REQUIRED: 'UNDER_REVIEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  READY: 'READY_FOR_SUBMISSION',
  VALIDATION_COMPLETE: 'READY_FOR_SUBMISSION',
  READY_TO_SUBMIT: 'READY_FOR_SUBMISSION',
  READY_FOR_SUBMISSION: 'READY_FOR_SUBMISSION',
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
  return normalizedStatus === 'PROCESSING' || normalizedStatus === 'UNDER_REVIEW'
    ? 'repairs_pending'
    : 'clean';
};

export const shouldRequireManualReview = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);
  return normalizedStatus === 'PROCESSING' || normalizedStatus === 'UNDER_REVIEW';
};

export const isUnderReview = (status?: string | null) =>
  normalizeClaimStatus(status) === 'UNDER_REVIEW';

export const isValidationRequired = isUnderReview;

export const isReadyForSubmission = (status?: string | null) =>
  normalizeClaimStatus(status) === 'READY_FOR_SUBMISSION';

export const isReadyToSubmit = isReadyForSubmission;

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
  void validationIssueCount;
  void readinessScore;
  void threshold;
  return 'UNDER_REVIEW';
};

export const getClaimStatusLabel = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);

  if (normalizedStatus === 'PROCESSING') return 'AI Processing';
  if (normalizedStatus === 'UNDER_REVIEW') return 'Requires Repair';
  if (normalizedStatus === 'READY_FOR_SUBMISSION') return 'Ready for Submission';
  if (normalizedStatus === 'SUBMITTED') return 'Submitted';
  if (normalizedStatus === 'APPROVED') return 'Approved';
  return 'Rejected';
};

export const getClaimStatusTone = (status?: string | null) => {
  const normalizedStatus = normalizeClaimStatus(status);

  if (normalizedStatus === 'APPROVED' || normalizedStatus === 'READY_FOR_SUBMISSION') {
    return 'success' as const;
  }

  if (normalizedStatus === 'REJECTED') {
    return 'danger' as const;
  }

  if (normalizedStatus === 'UNDER_REVIEW') {
    return 'warning' as const;
  }

  return 'info' as const;
};
