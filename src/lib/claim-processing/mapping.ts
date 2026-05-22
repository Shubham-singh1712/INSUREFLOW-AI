import { ExtractedFields, TraceableField, UiClaimField, ClaimPacket } from './types';
import { logger } from './logger';

const buildField = (
  id: string,
  label: string,
  field: TraceableField<any>
): UiClaimField => {
  return {
    id,
    label,
    value: field.value !== null && field.value !== undefined ? String(field.value) : '',
    confidence: field.confidence || 0,
    source: field.page ? `Page ${field.page}` : 'Not extracted',
    sourcePage: field.page,
    sourceDocType: field.docType || undefined,
    method: field.method || undefined,
  };
};

export const mapExtractedFieldsToUi = (
  extracted: ExtractedFields,
  packet: ClaimPacket
): UiClaimField[] => {
  const fields: UiClaimField[] = [
    // Patient
    buildField('patient_name', 'Patient Name', extracted.patient.full_name),
    buildField('patient_dob', 'Date of Birth', extracted.patient.dob),
    buildField('patient_gender', 'Gender', extracted.patient.gender),
    buildField('patient_age', 'Age', extracted.patient.age),
    buildField('patient_phone', 'Phone', extracted.patient.phone),
    buildField('patient_address', 'Address', extracted.patient.address),

    // Insurance
    buildField('provider_name', 'Insurance Provider', extracted.insurance.provider_name),
    buildField('tpa_name', 'TPA Name', extracted.insurance.tpa_name),
    buildField('policy_number', 'Policy Number', extracted.insurance.policy_number),
    buildField('member_id', 'Member ID', extracted.insurance.member_id),
    buildField('group_id', 'Corporate/Group ID', extracted.insurance.corporate_or_group_id),
    buildField('insurance_id', 'Insurance ID', extracted.insurance.insurance_id),

    // Hospital
    buildField('facility_name', 'Facility Name', extracted.hospital.facility_name),
    buildField('doctor_name', 'Doctor Name', extracted.hospital.doctor_name),
    buildField('registration_number', 'Registration Number', extracted.hospital.registration_number),
    buildField('admission_date', 'Admission Date', extracted.hospital.admission_date),
    buildField('discharge_date', 'Discharge Date', extracted.hospital.discharge_date),

    // Clinical
    buildField('diagnosis', 'Diagnosis', extracted.clinical.diagnosis),
    buildField('icd10_codes', 'ICD-10 Codes', {
      ...extracted.clinical.icd10_codes,
      value: extracted.clinical.icd10_codes.value?.join(', ') || null
    }),
    buildField('symptoms', 'Symptoms', extracted.clinical.symptoms),
    buildField('surgery', 'Surgery', extracted.clinical.surgery),
    buildField('procedure', 'Procedure', extracted.clinical.procedure),
    buildField('length_of_stay', 'Length of Stay (Days)', extracted.clinical.length_of_stay),
    buildField('emergency_case', 'Emergency Case', extracted.clinical.emergency_case),

    // Financial
    buildField('room_rent', 'Room Rent', extracted.financial.room_rent),
    buildField('icu_charges', 'ICU Charges', extracted.financial.icu_charges),
    buildField('ot_charges', 'OT Charges', extracted.financial.ot_charges),
    buildField('medicine', 'Medicine Charges', extracted.financial.medicine),
    buildField('investigations', 'Investigations Charges', extracted.financial.investigations),
    buildField('professional_fees', 'Professional Fees', extracted.financial.professional_fees),
    buildField('final_bill', 'Final Bill Amount', extracted.financial.final_bill),
    buildField('total_claimed', 'Total Claimed Amount', extracted.financial.total_claimed),

    // Authorization
    buildField('patient_signature', 'Patient Signature', extracted.authorization.patient_signature),
    buildField('doctor_signature', 'Doctor Signature', extracted.authorization.doctor_signature),
    buildField('hospital_seal', 'Hospital Seal', extracted.authorization.hospital_seal),
    buildField('approval_stamp', 'Approval Stamp', extracted.authorization.approval_stamp),
  ];

  logger.finalUiMapping(fields);
  return fields;
};
