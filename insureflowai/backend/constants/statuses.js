const CLAIM_STATUS = {
  DRAFT: 'draft',
  UPLOADED: 'uploaded',
  OCR_PROCESSING: 'ocr_processing',
  AI_VALIDATING: 'ai_validating',
  NEEDS_REPAIR: 'needs_repair',
  READY_TO_SUBMIT: 'ready_to_submit',
  SUBMITTED: 'submitted',
  REJECTED: 'rejected',
  APPROVED: 'approved',
};

const VALIDATION_STATUS = {
  PENDING: 'pending',
  PASSED: 'passed',
  WARNING: 'warning',
  FAILED: 'failed',
};

module.exports = { CLAIM_STATUS, VALIDATION_STATUS };
