// Shared types for legacy step components (kept for compatibility)
export interface UploadedDoc {
  name: string;
  size: string;
  status: 'uploading' | 'processing' | 'passed' | 'failed' | 'warning';
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
