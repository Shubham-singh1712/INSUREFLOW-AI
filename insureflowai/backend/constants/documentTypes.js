const DOCUMENT_TYPES = {
  INSURANCE_CARD: 'insurance_card',
  DISCHARGE_SUMMARY: 'discharge_summary',
  LAB_REPORTS: 'lab_reports',
  PRESCRIPTIONS: 'prescriptions',
  INVOICES: 'invoices',
  PATIENT_ID: 'patient_id',
};

const ALLOWED_DOCUMENT_TYPES = Object.values(DOCUMENT_TYPES);
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

module.exports = { DOCUMENT_TYPES, ALLOWED_DOCUMENT_TYPES, ALLOWED_MIME_TYPES };
