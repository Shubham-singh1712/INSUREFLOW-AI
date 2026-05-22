import { ExtractedFields, TraceableField, UiClaimField, ClaimPacket } from './types';
import { logger } from './logger';

const buildField = (id: string, label: string, field: TraceableField<any>): UiClaimField => {
  return {
    id,
    label,
    value: field.value !== null && field.value !== undefined ? String(field.value) : '',
    confidence: field.confidence || 0,
    source: field.page ? `Page ${field.page}` : 'Not extracted',
    sourcePage: field.page,
    page: field.page,
    sourceDocType: field.docType || undefined,
    method: field.method || undefined,
    raw: field.raw,
  };
};

export const mapExtractedFieldsToUi = (
  extracted: ExtractedFields,
  packet: ClaimPacket
): UiClaimField[] => {
  const fields: UiClaimField[] = [
    // Patient
    buildField('patient.full_name', 'Patient Name', extracted.patient.full_name),
    buildField('patient.dob', 'Date of Birth', extracted.patient.dob),
    buildField('patient.gender', 'Gender', extracted.patient.gender),
    buildField('patient.age', 'Age', extracted.patient.age),
    buildField('patient.phone', 'Phone', extracted.patient.phone),
    buildField('patient.address', 'Address', extracted.patient.address),

    // Insurance
    buildField('insurance.provider_name', 'Insurance Provider', extracted.insurance.provider_name),
    buildField('insurance.tpa_name', 'TPA Name', extracted.insurance.tpa_name),
    buildField('insurance.policy_number', 'Policy Number', extracted.insurance.policy_number),
    buildField('insurance.member_id', 'Member ID', extracted.insurance.member_id),
    buildField(
      'insurance.corporate_or_group_id',
      'Corporate/Group ID',
      extracted.insurance.corporate_or_group_id
    ),
    buildField('insurance.insurance_id', 'Insurance ID', extracted.insurance.insurance_id),

    // Hospital
    buildField('hospital.facility_name', 'Facility Name', extracted.hospital.facility_name),
    buildField('hospital.doctor_name', 'Doctor Name', extracted.hospital.doctor_name),
    buildField(
      'hospital.registration_number',
      'Registration Number',
      extracted.hospital.registration_number
    ),
    buildField('hospital.admission_date', 'Admission Date', extracted.hospital.admission_date),
    buildField('hospital.discharge_date', 'Discharge Date', extracted.hospital.discharge_date),

    // Clinical
    buildField('clinical.diagnosis', 'Diagnosis', extracted.clinical.diagnosis),
    buildField('clinical.icd10_codes', 'ICD-10 Codes', {
      ...extracted.clinical.icd10_codes,
      value: extracted.clinical.icd10_codes.value?.join(', ') || null,
    }),
    buildField('clinical.symptoms', 'Symptoms', extracted.clinical.symptoms),
    buildField('clinical.surgery', 'Surgery', extracted.clinical.surgery),
    buildField('clinical.procedure', 'Procedure', extracted.clinical.procedure),
    buildField(
      'clinical.length_of_stay',
      'Length of Stay (Days)',
      extracted.clinical.length_of_stay
    ),
    buildField('clinical.emergency_case', 'Emergency Case', extracted.clinical.emergency_case),

    // Financial
    buildField('financial.room_rent', 'Room Rent', extracted.financial.room_rent),
    buildField('financial.icu_charges', 'ICU Charges', extracted.financial.icu_charges),
    buildField('financial.ot_charges', 'OT Charges', extracted.financial.ot_charges),
    buildField('financial.medicine', 'Medicine Charges', extracted.financial.medicine),
    buildField(
      'financial.investigations',
      'Investigations Charges',
      extracted.financial.investigations
    ),
    buildField(
      'financial.professional_fees',
      'Professional Fees',
      extracted.financial.professional_fees
    ),
    buildField('financial.final_bill', 'Final Bill Amount', extracted.financial.final_bill),
    buildField(
      'financial.total_claimed',
      'Total Claimed Amount',
      extracted.financial.total_claimed
    ),

    // Authorization
    buildField(
      'authorization.patient_signature',
      'Patient Signature',
      extracted.authorization.patient_signature
    ),
    buildField(
      'authorization.doctor_signature',
      'Doctor Signature',
      extracted.authorization.doctor_signature
    ),
    buildField(
      'authorization.hospital_seal',
      'Hospital Seal',
      extracted.authorization.hospital_seal
    ),
    buildField(
      'authorization.approval_stamp',
      'Approval Stamp',
      extracted.authorization.approval_stamp
    ),
  ];

  logger.finalUiMapping(fields);
  return fields;
};
