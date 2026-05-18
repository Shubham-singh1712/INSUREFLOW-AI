export type UploadedDocStatus = 'uploading' | 'processing' | 'passed' | 'failed' | 'warning';

export interface UploadedDoc {
  name: string;
  size: string;
  status: UploadedDocStatus;
  progress: number;
  message?: string;
  documentType?: string;
  mimeType?: string;
  dataUrl?: string;
}

export interface ExtractedClaimData {
  patient: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    address: string;
    contact_phone: string;
    contact_email: string;
  };
  insurance: {
    policyholder_name: string;
    group_number: string;
    member_id: string;
    payer_id: string;
    plan_name: string;
  };
  pre_authorization: {
    approval_code: string;
    authorized_from: string;
    authorized_to: string;
  };
  clinical: {
    admission_date: string;
    discharge_date: string;
    attending_physician: string;
    hospital_npi: string;
    hospital_tax_id: string;
    facility_name: string;
    principal_diagnosis: string;
  };
  coding: {
    icd10_codes: Array<{ code: string; description: string; confidence: number }>;
    cpt_codes: Array<{ code: string; description: string; confidence: number }>;
  };
  billing: {
    total_billed_amount: string;
    line_items: Array<{
      description: string;
      quantity: number;
      unit_price: string;
      gross_charge: string;
    }>;
  };
  extraction_meta: {
    overall_confidence: number;
    low_confidence_fields: string[];
    requires_manual_review: boolean;
  };
}

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const classifyUploadedDocument = (file: File, documentType: string): UploadedDoc => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const isAllowed = allowedTypes.includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  const isTooLarge = file.size > 20 * 1024 * 1024;
  const isTiny = file.size < 8 * 1024;

  if (!isAllowed) {
    return {
      name: file.name,
      size: formatFileSize(file.size),
      status: 'failed',
      progress: 100,
      documentType,
      mimeType: file.type,
      message: 'Unsupported file type. Upload PDF, JPG, or PNG.',
    };
  }

  if (isTooLarge) {
    return {
      name: file.name,
      size: formatFileSize(file.size),
      status: 'failed',
      progress: 100,
      documentType,
      mimeType: file.type,
      message: 'File exceeds the 20MB upload limit.',
    };
  }

  return {
    name: file.name,
    size: formatFileSize(file.size),
    status: isTiny ? 'warning' : 'passed',
    progress: 100,
    documentType,
    mimeType: file.type,
    message: isTiny
      ? 'Low file size detected. OCR may need manual review.'
      : 'Document ready for AI extraction.',
  };
};

export const runGatekeeper = (documents: Record<string, UploadedDoc>) => {
  const docs = Object.values(documents);
  const hasReadableDocument = docs.some(
    (doc) => doc.status === 'passed' || doc.status === 'warning'
  );

  return {
    passed: hasReadableDocument,
    detectedName: null,
    confidence: hasReadableDocument ? 70 : 0,
    checks: [
      { id: 'ocr-pass', status: hasReadableDocument ? 'passed' : 'failed' },
      { id: 'patient-name', status: 'pending' },
      { id: 'doc-type', status: docs.length > 0 ? 'passed' : 'failed' },
      { id: 'readability', status: hasReadableDocument ? 'passed' : 'failed' },
    ],
  };
};

const confidenceFieldPaths = [
  'patient.full_name',
  'patient.date_of_birth',
  'patient.gender',
  'patient.address',
  'patient.contact_phone',
  'patient.contact_email',
  'insurance.policyholder_name',
  'insurance.group_number',
  'insurance.member_id',
  'insurance.payer_id',
  'insurance.plan_name',
  'pre_authorization.approval_code',
  'clinical.admission_date',
  'clinical.discharge_date',
  'clinical.attending_physician',
  'clinical.hospital_npi',
  'clinical.hospital_tax_id',
  'clinical.facility_name',
  'clinical.principal_diagnosis',
] as const;

const getNestedString = (data: ExtractedClaimData, path: string) =>
  path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);

export const calculateExtractionConfidence = (data: ExtractedClaimData) => {
  const populatedFields = confidenceFieldPaths.filter((path) => {
    const value = getNestedString(data, path);
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
  const fieldCompleteness = populatedFields / confidenceFieldPaths.length;
  const codeConfidences = [...data.coding.icd10_codes, ...data.coding.cpt_codes]
    .map((code) => code.confidence)
    .filter((confidence) => Number.isFinite(confidence));
  const codeConfidence =
    codeConfidences.length > 0
      ? codeConfidences.reduce((sum, confidence) => sum + confidence, 0) / codeConfidences.length
      : 0;
  const totalBilled = Number.parseInt(data.billing.total_billed_amount, 10);
  const hasBillingTotal = Number.isFinite(totalBilled) && totalBilled > 0;
  const billingCompleteness = hasBillingTotal && data.billing.line_items.length > 0 ? 1 : 0;
  const lowConfidencePenalty = Math.min(data.extraction_meta.low_confidence_fields.length * 4, 28);
  const reviewPenalty = data.extraction_meta.requires_manual_review ? 5 : 0;

  if (populatedFields === 0 && codeConfidences.length === 0 && !hasBillingTotal) return 0;

  const score =
    45 +
    fieldCompleteness * 35 +
    codeConfidence * 12 +
    billingCompleteness * 8 -
    lowConfidencePenalty -
    reviewPenalty;

  return Math.max(0, Math.min(99, Math.round(score)));
};

export const scrubClaimData = (data: ExtractedClaimData) => {
  const npi = data.clinical.hospital_npi;
  const taxId = data.clinical.hospital_tax_id;
  const dob = data.patient.date_of_birth;
  const admissionDate = new Date(data.clinical.admission_date);
  const dischargeDate = new Date(data.clinical.discharge_date);
  const lineSum = data.billing.line_items.reduce(
    (sum, item) => sum + Number.parseInt(item.gross_charge, 10),
    0
  );
  const totalBilled = Number.parseInt(data.billing.total_billed_amount, 10);

  const constraints = [
    {
      id: 'completeness',
      status: npi && taxId && dob ? 'passed' : 'failed',
      detail: npi && taxId && dob ? 'NPI, Tax ID, and DOB all present' : undefined,
      error:
        npi && taxId && dob
          ? undefined
          : `Missing required fields: ${[
              !npi && 'Hospital NPI',
              !taxId && 'Tax ID',
              !dob && 'Patient DOB',
            ]
              .filter(Boolean)
              .join(', ')}`,
    },
    {
      id: 'logic',
      status: dischargeDate >= admissionDate ? 'passed' : 'failed',
      detail:
        dischargeDate >= admissionDate
          ? `Discharge (${data.clinical.discharge_date}) >= Admission (${data.clinical.admission_date})`
          : undefined,
      error: dischargeDate >= admissionDate ? undefined : 'Discharge date is before admission date',
    },
    {
      id: 'math',
      status: lineSum === totalBilled ? 'passed' : 'failed',
      detail:
        lineSum === totalBilled
          ? `Line items sum INR ${lineSum.toLocaleString('en-IN')} = Total INR ${totalBilled.toLocaleString('en-IN')}`
          : undefined,
      error:
        lineSum === totalBilled
          ? undefined
          : `Line items sum INR ${lineSum.toLocaleString('en-IN')} does not equal total INR ${totalBilled.toLocaleString('en-IN')}`,
    },
  ] as const;

  return {
    constraints,
    allPassed: constraints.every((constraint) => constraint.status === 'passed'),
  };
};

export const buildSubmissionPayload = (claimId: string, data: ExtractedClaimData) => ({
  claimId,
  status: 'submitted',
  submittedAt: new Date().toISOString(),
  ub04: {
    patientControlNumber: claimId,
    providerName: data.clinical.facility_name,
    patientName: data.patient.full_name,
    patientDob: data.patient.date_of_birth,
    hospitalNpi: data.clinical.hospital_npi,
    principalDiagnosis: data.clinical.principal_diagnosis,
  },
  edi837i: {
    transaction_set: '837I',
    version: '005010X223A2',
    claim: {
      patient_control_number: claimId,
      total_claim_charge: Number.parseInt(data.billing.total_billed_amount, 10),
      principal_diagnosis: data.clinical.principal_diagnosis,
      procedure_codes: data.coding.cpt_codes.map((code) => code.code),
      service_lines: data.billing.line_items,
    },
  },
});
