import { ExtractedFields, ValidationError, RejectionRisk } from './types';

const severityWeight = (severity: string) => {
  if (severity === 'critical') return 24;
  if (severity === 'high') return 16;
  if (severity === 'medium') return 9;
  return 4;
};

export function calculateScores( // MODIFIED
  extracted: ExtractedFields,
  validationErrors: ValidationError[],
  ocrConfidence: number
): { claimHealth: number; readiness: number; extractionConfidence: number; rejectionRisk: RejectionRisk } { // MODIFIED
  // Claim Health Calculation (100 - penalties)
  const healthPenalty = validationErrors.reduce(
    (sum, err) => sum + severityWeight(err.severity),
    0
  );
  let claimHealth = Math.max(0, 100 - healthPenalty);

  // Confidence factor
  if (ocrConfidence > 0 && ocrConfidence < 70) {
    claimHealth = Math.round(claimHealth * 0.85);
  }

  // Readiness Calculation (0-100) based on critical fields presence
  const requiredFields = [
    extracted?.patient?.full_name?.value,
    extracted?.patient?.dob?.value,
    extracted?.hospital?.facility_name?.value,
    extracted?.clinical?.diagnosis?.value,
    extracted?.financial?.total_claimed?.value || extracted?.financial?.final_bill?.value,
  ];

  const presentRequired = requiredFields.filter(Boolean).length;
  const readiness = Math.round((presentRequired / requiredFields.length) * 100);

  // Extraction Confidence Calculation (average confidence of populated fields) // MODIFIED
  let sumConfidence = 0; // MODIFIED
  let countFields = 0; // MODIFIED
  const traverse = (obj: any) => { // MODIFIED
    if (!obj || typeof obj !== 'object') return; // MODIFIED
    if ('value' in obj && 'confidence' in obj) { // MODIFIED
      if (obj.value !== null && obj.value !== undefined && obj.value !== '' && (!Array.isArray(obj.value) || obj.value.length > 0)) { // MODIFIED
        sumConfidence += obj.confidence || 0; // MODIFIED
        countFields += 1; // MODIFIED
      } // MODIFIED
    } else { // MODIFIED
      for (const key of Object.keys(obj)) { // MODIFIED
        traverse(obj[key]); // MODIFIED
      } // MODIFIED
    } // MODIFIED
  }; // MODIFIED
  traverse(extracted); // MODIFIED
  const extractionConfidence = countFields > 0 ? Math.round(sumConfidence / countFields) : 0; // MODIFIED

  // Rejection Risk
  let rejectionRisk: RejectionRisk = 'low';
  if (claimHealth < 50 || validationErrors.some((e) => e.severity === 'critical')) {
    rejectionRisk = 'high';
  } else if (claimHealth < 80 || validationErrors.some((e) => e.severity === 'high')) {
    rejectionRisk = 'medium';
  }

  return { claimHealth, readiness, extractionConfidence, rejectionRisk }; // MODIFIED
}
