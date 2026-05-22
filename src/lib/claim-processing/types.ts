export type ClaimState =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'OCR_COMPLETE'
  | 'CLASSIFIED'
  | 'REVIEW_REQUIRED'
  | 'READY'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

export type ExtractionMethod = 'pdf_text' | 'pdf_text_only' | 'ocr' | 'mixed' | 'metadata_only';
export type FieldMethod = 'pdf_text' | 'ocr';
export type PdfKind = 'text_layer' | 'scanned_or_image';
export type PipelineStage =
  | 'upload_parse_failed'
  | 'pdf_parse_failed'
  | 'pdf_text_extract_failed'
  | 'pdf_renderer_failed'
  | 'canvas_init_failed'
  | 'ocr_worker_failed'
  | 'ocr_extract_failed'
  | 'classification_failed'
  | 'entity_extraction_failed'
  | 'validation_failed';

export type PageDocType =
  | 'insurance_card'
  | 'tpa_card'
  | 'aadhaar'
  | 'pan'
  | 'preauth_form'
  | 'claim_form'
  | 'invoice'
  | 'final_bill'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_report'
  | 'radiology'
  | 'doctor_notes'
  | 'ub04'
  | 'hospital_form'
  | 'diagnosis_sheet'
  | 'id_proof'
  | 'clinical_note'
  | 'unknown';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type UiSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type RejectionRisk = 'low' | 'medium' | 'high';

export type PageText = {
  page: number;
  text: string;
  method: FieldMethod;
  confidence: number;
};

export type ClassifiedPage = {
  page: number;
  type: PageDocType;
  confidence: number;
};

export type TraceableField<T = string | number | boolean | string[] | null> = {
  value: T;
  confidence: number;
  page: number | null;
  docType: PageDocType | null;
  method: FieldMethod | null;
  raw: string | null;
};

export type ExtractedFields = {
  patient: {
    full_name: TraceableField<string | null>;
    dob: TraceableField<string | null>;
    gender: TraceableField<string | null>;
    age: TraceableField<number | null>;
    phone: TraceableField<string | null>;
    address: TraceableField<string | null>;
  };
  insurance: {
    provider_name: TraceableField<string | null>;
    tpa_name: TraceableField<string | null>;
    policy_number: TraceableField<string | null>;
    member_id: TraceableField<string | null>;
    corporate_or_group_id: TraceableField<string | null>;
    insurance_id: TraceableField<string | null>;
  };
  hospital: {
    facility_name: TraceableField<string | null>;
    doctor_name: TraceableField<string | null>;
    registration_number: TraceableField<string | null>;
    admission_date: TraceableField<string | null>;
    discharge_date: TraceableField<string | null>;
  };
  clinical: {
    diagnosis: TraceableField<string | null>;
    icd10_codes: TraceableField<string[] | null>;
    symptoms: TraceableField<string | null>;
    surgery: TraceableField<string | null>;
    procedure: TraceableField<string | null>;
    length_of_stay: TraceableField<number | null>;
    emergency_case: TraceableField<boolean | null>;
  };
  financial: {
    room_rent: TraceableField<number | null>;
    icu_charges: TraceableField<number | null>;
    ot_charges: TraceableField<number | null>;
    medicine: TraceableField<number | null>;
    investigations: TraceableField<number | null>;
    professional_fees: TraceableField<number | null>;
    final_bill: TraceableField<number | null>;
    total_claimed: TraceableField<number | null>;
  };
  authorization: {
    patient_signature: TraceableField<boolean | null>;
    doctor_signature: TraceableField<boolean | null>;
    hospital_seal: TraceableField<boolean | null>;
    approval_stamp: TraceableField<boolean | null>;
  };
};

export type ValidationError = {
  field: string;
  issue: string;
  severity: Severity;
  pages: number[];
  relatedFields?: string[];
  suggestedAction?: string;
};

export type RepairSuggestion = {
  fieldId: string;
  suggestion: string;
  confidence: number;
  reason: string;
};

export type ClaimSession = {
  claimId: string;
  uploadSessionId: string;
  sessionId?: string;
  uploadStartedAt: string;
  originalFileName: string;
  fileSizeBytes: number;
};

export type ClaimPacket = {
  success: boolean;
  extractionMethod: ExtractionMethod;
  ocrSkippedReason?: string;
  claimId: string;
  uploadSessionId: string;
  pageCount: number;
  classifiedPages: ClassifiedPage[];
  extractedFields: ExtractedFields;
  validationErrors: ValidationError[];
  claimHealth: number;
  readiness: number;
  ocrConfidence: number;
  rejectionRisk: RejectionRisk;
  repairSuggestions: RepairSuggestion[];
  intake: ClaimSession;
  pdfType: PdfKind;
  state: ClaimState;
};

export type Pattern<T> = {
  regex: RegExp;
  normalize?: (value: string, context: string) => T | null;
  confidence?: number;
  pageTypes?: PageDocType[];
};

export type Candidate<T> = {
  value: T;
  confidence: number;
  page: number;
  docType: PageDocType;
  method: FieldMethod;
  raw: string;
};

// UI Mapping Types

export type UiClaimField = {
  id: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  sourcePage: number | null;
  page?: number | null;
  sourceDocType?: string;
  method?: string;
  raw?: string | null;
};

export type UiValidationIssue = {
  id: string;
  title: string;
  severity: UiSeverity;
  affectedPages: number[];
  remediation?: string;
};

export type UiValidationReport = {
  overallHealth: number;
  readinessScore: number;
  rejectionRisk: RejectionRisk;
  issues: UiValidationIssue[];
  pagesAnalyzed: number;
};
