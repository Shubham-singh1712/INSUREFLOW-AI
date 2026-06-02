import type { ExtractedClaimData } from './claims';

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  change: string;
  changeDir: 'up' | 'down';
  changeLabel: string;
  tone: 'success' | 'danger' | 'warning' | 'info' | 'muted';
  highlight?: boolean;
  alert?: boolean;
  description: string;
  colSpan: string;
};

export type DashboardClaim = {
  id: string;
  claimId: string;
  patient: string;
  age: number;
  tpa: string;
  documents: { total: number; passed: number };
  aiConfidence: number;
  repairStatus: 'clean' | 'repairs_pending' | 'ocr_failed' | 'signature_missing' | 'ready';
  submissionScore: number;
  amount: string;
  admissionDate: string;
  status:
    | 'PROCESSING'
    | 'UNDER_REVIEW'
    | 'READY_FOR_SUBMISSION'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'ai_processing'
    | 'validation_complete'
    | 'repairs_pending'
    | 'ready'
    | 'submitted'
    | 'approved'
    | 'rejected';
};

export type ClaimRegisterRow = {
  id: string;
  patient: string;
  tpa: string;
  issue: string;
  score: string;
  status: 'Needs Repair' | 'Ready' | 'Blocked' | 'Queued';
};

export const demoDashboardMetrics: DashboardMetric[] = [
  {
    id: 'metric-validation-rate',
    label: 'Validation Success Rate',
    value: '91.4%',
    change: '+3.2%',
    changeDir: 'up',
    changeLabel: 'vs. yesterday',
    tone: 'success',
    highlight: true,
    description: 'Claims passing AI validation without manual repair',
    colSpan: 'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-2',
  },
  {
    id: 'metric-attention',
    label: 'Claims Requiring Attention',
    value: '5',
    change: '+2',
    changeDir: 'down',
    changeLabel: 'since 9 AM',
    tone: 'danger',
    alert: true,
    description: 'Unresolved repair suggestions blocking submission',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-pending',
    label: 'Pending Submissions',
    value: '12',
    change: '-4',
    changeDir: 'up',
    changeLabel: 'submitted today',
    tone: 'warning',
    description: 'Claims ready or near-ready for TPA submission',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-rejection',
    label: 'TPA Rejection Rate',
    value: '4.7%',
    change: '-1.3%',
    changeDir: 'up',
    changeLabel: 'vs. last week',
    tone: 'success',
    description: 'Claims rejected after TPA submission this month',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-ocr',
    label: 'OCR Extraction Accuracy',
    value: '96.8%',
    change: '+0.4%',
    changeDir: 'up',
    changeLabel: 'vs. yesterday',
    tone: 'info',
    description: 'Documents with successful text extraction',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-docs',
    label: 'Documents Processed Today',
    value: '347',
    change: '+61',
    changeDir: 'up',
    changeLabel: 'vs. daily avg',
    tone: 'muted',
    description: 'Total documents scanned and validated today',
    colSpan: 'col-span-1',
  },
];

export const emptyDashboardMetrics: DashboardMetric[] = demoDashboardMetrics.map((metric) => ({
  ...metric,
  value: metric.value.endsWith('%') ? '0%' : '0',
  change: metric.change.includes('%') ? '0%' : '0',
  changeDir: 'up',
  alert: false,
}));

export const demoDashboardClaims: DashboardClaim[] = [
  {
    id: 'claim-001',
    claimId: 'CLM-2847',
    patient: 'Arjun Mehta',
    age: 54,
    tpa: 'Apollo Munich',
    documents: { total: 6, passed: 5 },
    aiConfidence: 78,
    repairStatus: 'signature_missing',
    submissionScore: 62,
    amount: 'INR 1,84,500',
    admissionDate: '05/01/2026',
    status: 'repairs_pending',
  },
  {
    id: 'claim-002',
    claimId: 'CLM-2848',
    patient: 'Priya Nair',
    age: 42,
    tpa: 'Star Health',
    documents: { total: 5, passed: 5 },
    aiConfidence: 96,
    repairStatus: 'ready',
    submissionScore: 94,
    amount: 'INR 72,000',
    admissionDate: '05/02/2026',
    status: 'ready',
  },
  {
    id: 'claim-003',
    claimId: 'CLM-2849',
    patient: 'Ramesh Iyer',
    age: 67,
    tpa: 'HDFC ERGO',
    documents: { total: 7, passed: 7 },
    aiConfidence: 99,
    repairStatus: 'clean',
    submissionScore: 98,
    amount: 'INR 3,21,000',
    admissionDate: '04/29/2026',
    status: 'ready',
  },
  {
    id: 'claim-004',
    claimId: 'CLM-2850',
    patient: 'Kavitha Suresh',
    age: 38,
    tpa: 'New India',
    documents: { total: 6, passed: 4 },
    aiConfidence: 61,
    repairStatus: 'ocr_failed',
    submissionScore: 41,
    amount: 'INR 95,500',
    admissionDate: '05/03/2026',
    status: 'repairs_pending',
  },
  {
    id: 'claim-005',
    claimId: 'CLM-2851',
    patient: 'Venkat Reddy',
    age: 71,
    tpa: 'Apollo Munich',
    documents: { total: 5, passed: 2 },
    aiConfidence: 43,
    repairStatus: 'ocr_failed',
    submissionScore: 28,
    amount: 'INR 2,67,000',
    admissionDate: '05/04/2026',
    status: 'repairs_pending',
  },
  {
    id: 'claim-006',
    claimId: 'CLM-2839',
    patient: 'Sunita Patel',
    age: 45,
    tpa: 'Star Health',
    documents: { total: 6, passed: 6 },
    aiConfidence: 94,
    repairStatus: 'ready',
    submissionScore: 92,
    amount: 'INR 1,12,000',
    admissionDate: '04/27/2026',
    status: 'submitted',
  },
  {
    id: 'claim-007',
    claimId: 'CLM-2840',
    patient: 'Deepak Sharma',
    age: 59,
    tpa: 'ICICI Lombard',
    documents: { total: 7, passed: 6 },
    aiConfidence: 82,
    repairStatus: 'repairs_pending',
    submissionScore: 71,
    amount: 'INR 4,88,000',
    admissionDate: '04/28/2026',
    status: 'validation_complete',
  },
  {
    id: 'claim-008',
    claimId: 'CLM-2841',
    patient: 'Meena Krishnan',
    age: 33,
    tpa: 'Bajaj Allianz',
    documents: { total: 4, passed: 4 },
    aiConfidence: 97,
    repairStatus: 'clean',
    submissionScore: 96,
    amount: 'INR 38,500',
    admissionDate: '04/28/2026',
    status: 'approved',
  },
  {
    id: 'claim-009',
    claimId: 'CLM-2842',
    patient: 'Rajiv Anand',
    age: 62,
    tpa: 'United India',
    documents: { total: 6, passed: 5 },
    aiConfidence: 74,
    repairStatus: 'signature_missing',
    submissionScore: 58,
    amount: 'INR 1,54,000',
    admissionDate: '04/30/2026',
    status: 'repairs_pending',
  },
  {
    id: 'claim-010',
    claimId: 'CLM-2843',
    patient: 'Ananya Bose',
    age: 28,
    tpa: 'Max Bupa',
    documents: { total: 5, passed: 5 },
    aiConfidence: 91,
    repairStatus: 'ready',
    submissionScore: 89,
    amount: 'INR 62,000',
    admissionDate: '05/01/2026',
    status: 'ready',
  },
];

export const demoClaimRegisterRows: ClaimRegisterRow[] = [
  {
    id: 'CLM-2847',
    patient: 'Arjun Mehta',
    tpa: 'Apollo Munich',
    issue: 'Missing signature',
    score: '62',
    status: 'Needs Repair',
  },
  {
    id: 'CLM-2848',
    patient: 'Priya Nair',
    tpa: 'Star Health',
    issue: 'Clean packet',
    score: '94',
    status: 'Ready',
  },
  {
    id: 'CLM-2849',
    patient: 'Ramesh Iyer',
    tpa: 'HDFC ERGO',
    issue: 'AI verified',
    score: '98',
    status: 'Ready',
  },
  {
    id: 'CLM-2851',
    patient: 'Venkat Reddy',
    tpa: 'Apollo Munich',
    issue: 'OCR failed',
    score: '28',
    status: 'Blocked',
  },
  {
    id: 'CLM-2843',
    patient: 'Ananya Bose',
    tpa: 'Max Bupa',
    issue: 'Queued for dispatch',
    score: '89',
    status: 'Queued',
  },
];

export const emptyExtractedClaimData: ExtractedClaimData = {
  patient: {
    full_name: '',
    date_of_birth: '',
    gender: '',
    address: '',
    contact_phone: '',
    contact_email: '',
  },
  insurance: {
    policyholder_name: '',
    group_number: '',
    member_id: '',
    payer_id: '',
    plan_name: '',
  },
  pre_authorization: {
    approval_code: '',
    authorized_from: '',
    authorized_to: '',
  },
  clinical: {
    admission_date: '',
    discharge_date: '',
    attending_physician: '',
    hospital_npi: '',
    hospital_tax_id: '',
    facility_name: '',
    principal_diagnosis: '',
  },
  coding: {
    icd10_codes: [],
    cpt_codes: [],
  },
  billing: {
    total_billed_amount: '0',
    line_items: [],
  },
  extraction_meta: {
    overall_confidence: 0,
    low_confidence_fields: [],
    requires_manual_review: true,
  },
};
