const runMockClaimValidation = ({ claim, documents = [] }) => {
  const documentTypes = new Set(documents.map((doc) => doc.documentType));
  const requiredDocuments = ['insurance_card', 'discharge_summary', 'invoices', 'patient_id'];
  const missingDocuments = requiredDocuments.filter((docType) => !documentTypes.has(docType));
  const qualityWarnings = documents.filter((doc) => doc.quality?.readable === false);
  const hasCriticalGaps = missingDocuments.length > 1 || qualityWarnings.length > 0;
  const readinessScore = Math.max(45, 96 - missingDocuments.length * 12 - qualityWarnings.length * 10);

  return {
    validationStatus: hasCriticalGaps ? 'warning' : 'passed',
    confidenceScore: hasCriticalGaps ? 82 : 94,
    issuesDetected: [
      ...missingDocuments.map((docType) => ({
        type: 'missing_document',
        severity: docType === 'insurance_card' ? 'high' : 'medium',
        message: `Missing ${docType.replace(/_/g, ' ')}.`,
      })),
      ...qualityWarnings.map((doc) => ({
        type: 'document_quality',
        severity: 'medium',
        message: `${doc.originalName} may be unreadable.`,
      })),
    ],
    repairSuggestions: missingDocuments.map((docType) => ({
      title: `Upload ${docType.replace(/_/g, ' ')}`,
      severity: docType === 'insurance_card' ? 'high' : 'medium',
      recommendation: `Attach a clear copy of the ${docType.replace(/_/g, ' ')} before submission.`,
      fieldPath: `documents.${docType}`,
      autoFixAvailable: false,
    })),
    submissionReadiness: {
      score: readinessScore,
      ready: readinessScore >= 85 && missingDocuments.length === 0,
    },
    aiSummary: `Claim ${claim.uniqueClaimId} has ${missingDocuments.length} missing required document(s) and a readiness score of ${readinessScore}.`,
  };
};

module.exports = { runMockClaimValidation };
