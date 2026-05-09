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
  quality: doc.quality,
})), null, 2)}
`;

module.exports = { buildClaimValidationPrompt };
