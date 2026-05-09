export type UploadedDocStatus = 'uploading' | 'processing' | 'passed' | 'failed' | 'warning';

export interface UploadedDoc {
  name: string;
  size: string;
  status: UploadedDocStatus;
  progress: number;
  message?: string;
  documentType?: string;
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
    line_items: Array<{ description: string; quantity: number; unit_price: string; gross_charge: string }>;
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
      message: 'File exceeds the 20MB upload limit.',
    };
  }

  return {
    name: file.name,
    size: formatFileSize(file.size),
    status: isTiny ? 'warning' : 'passed',
    progress: 100,
    documentType,
    message: isTiny
      ? 'Low file size detected. OCR may need manual review.'
      : 'OCR extraction complete. All expected fields detected.',
  };
};

export const mockExtractedClaimData: ExtractedClaimData = {
  patient: {
    full_name: 'Ramesh Kumar Iyer',
    date_of_birth: '1958-03-14',
    gender: 'M',
    address: '14, Poes Garden, Chennai - 600086, Tamil Nadu',
    contact_phone: '+91 98765 43210',
    contact_email: 'ramesh.iyer@email.com',
  },
  insurance: {
    policyholder_name: 'Ramesh Kumar Iyer',
    group_number: 'GRP-APM-2024-0048',
    member_id: 'MEM-7748291034',
    payer_id: 'APMH-PAYER-001',
    plan_name: 'Apollo Munich Optima Restore',
  },
  pre_authorization: {
    approval_code: 'PA-2026-00847',
    authorized_from: '2026-05-01',
    authorized_to: '2026-05-10',
  },
  clinical: {
    admission_date: '2026-05-01',
    discharge_date: '2026-05-06',
    attending_physician: 'Dr. Suresh Babu, Cardiologist',
    hospital_npi: '1234567890',
    hospital_tax_id: '33-AAACH1234C1Z5',
    facility_name: 'Apollo Hospitals, Greams Road, Chennai',
    principal_diagnosis: 'I21.0',
  },
  coding: {
    icd10_codes: [
      { code: 'I21.0', description: 'Acute transmural myocardial infarction of anterior wall', confidence: 0.97 },
      { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery', confidence: 0.89 },
    ],
    cpt_codes: [
      { code: '92928', description: 'Percutaneous transcatheter placement of intracoronary stent', confidence: 0.94 },
      { code: '93510', description: 'Left heart catheterization', confidence: 0.78 },
    ],
  },
  billing: {
    total_billed_amount: '184500',
    line_items: [
      { description: 'ICU Charges (5 days)', quantity: 5, unit_price: '12000', gross_charge: '60000' },
      { description: 'Coronary Angioplasty Procedure', quantity: 1, unit_price: '85000', gross_charge: '85000' },
      { description: 'Stent (Drug Eluting)', quantity: 1, unit_price: '28000', gross_charge: '28000' },
      { description: 'Pharmacy & Consumables', quantity: 1, unit_price: '11500', gross_charge: '11500' },
    ],
  },
  extraction_meta: {
    overall_confidence: 88,
    low_confidence_fields: ['insurance.payer_id', 'coding.cpt_codes[1].code'],
    requires_manual_review: true,
  },
};

export const runGatekeeper = (documents: Record<string, UploadedDoc>) => {
  const docs = Object.values(documents);
  const hasReadableDocument = docs.some((doc) => doc.status === 'passed' || doc.status === 'warning');

  return {
    passed: hasReadableDocument,
    detectedName: hasReadableDocument ? mockExtractedClaimData.patient.full_name : null,
    confidence: hasReadableDocument ? 96 : 0,
    checks: [
      { id: 'ocr-pass', status: hasReadableDocument ? 'passed' : 'failed' },
      { id: 'patient-name', status: hasReadableDocument ? 'passed' : 'failed' },
      { id: 'doc-type', status: docs.length > 0 ? 'passed' : 'failed' },
      { id: 'readability', status: hasReadableDocument ? 'passed' : 'failed' },
    ],
  };
};

export const scrubClaimData = (data: ExtractedClaimData) => {
  const npi = data.clinical.hospital_npi;
  const taxId = data.clinical.hospital_tax_id;
  const dob = data.patient.date_of_birth;
  const admissionDate = new Date(data.clinical.admission_date);
  const dischargeDate = new Date(data.clinical.discharge_date);
  const lineSum = data.billing.line_items.reduce((sum, item) => sum + Number.parseInt(item.gross_charge, 10), 0);
  const totalBilled = Number.parseInt(data.billing.total_billed_amount, 10);

  const constraints = [
    {
      id: 'completeness',
      status: npi && taxId && dob ? 'passed' : 'failed',
      detail: npi && taxId && dob ? 'NPI, Tax ID, and DOB all present' : undefined,
      error:
        npi && taxId && dob
          ? undefined
          : `Missing required fields: ${[!npi && 'Hospital NPI', !taxId && 'Tax ID', !dob && 'Patient DOB']
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
      detail: lineSum === totalBilled ? `Line items sum INR ${lineSum.toLocaleString('en-IN')} = Total INR ${totalBilled.toLocaleString('en-IN')}` : undefined,
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
