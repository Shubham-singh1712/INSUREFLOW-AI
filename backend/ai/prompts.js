const buildClaimValidationPrompt = (claim, documents = []) => `
You are InsureFlow AI, an assistant for hospital insurance claim validation.
Return strict JSON only. Assess missing documents, OCR confidence, compliance risks,
rejection risk, repair recommendations, and submission readiness.

Claim:
${JSON.stringify({
  uniqueClaimId: claim.uniqueClaimId,
  patientName: claim.patientName,
  insuranceProvider: claim.insuranceProvider,
  diagnosis: claim.diagnosis,
  procedure: claim.procedure,
}, null, 2)}

Documents:
${JSON.stringify(documents.map((doc) => ({
  type: doc.documentType,
  originalName: doc.originalName,
  ocrFields: doc.ocrFields,
  extractedText: doc.ocrText,
  quality: doc.quality,
})), null, 2)}

Validate only from the claim metadata and extracted document text above.
Generate contextual issues for missing DOB, invoice mismatch, missing signatures,
incomplete insurance ID, blurry or low-text scans, inconsistent totals, missing pages,
missing diagnosis, date logic, payer readiness, and any claim-specific evidence you see.
Return this JSON shape:
{
  "validationStatus": "passed" | "warning" | "failed",
  "confidenceScore": number,
  "aiSummary": string,
  "issuesDetected": [{ "title": string, "severity": "low" | "medium" | "high" | "critical", "confidence": number, "evidence": string }],
  "repairSuggestions": [{ "title": string, "severity": "low" | "medium" | "high" | "critical", "recommendation": string, "fieldPath": string, "autoFixAvailable": boolean }],
  "submissionReadiness": { "score": number, "ready": boolean }
}
`;

module.exports = { buildClaimValidationPrompt };
