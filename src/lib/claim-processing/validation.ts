import { ExtractedFields, ValidationError, RepairSuggestion, Severity, ClaimPacket } from './types';
import { daysBetween } from './utils';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function validateExtractedData(
  extracted: ExtractedFields,
  pagesCount: number
): { errors: ValidationError[]; repairSuggestions: RepairSuggestion[] } {
  const errors: ValidationError[] = [];
  const suggestions: RepairSuggestion[] = [];

  const addError = (
    field: string,
    issue: string,
    severity: Severity,
    pages: number[],
    relatedFields?: string[],
    fix?: string
  ) => {
    errors.push({ field, issue, severity, pages, relatedFields, suggestedAction: fix });
  };

  const addSuggestion = (
    fieldId: string,
    suggestion: string,
    reason: string,
    confidence: number
  ) => {
    suggestions.push({ fieldId, suggestion, reason, confidence });
  };

  // 1. Patient validations (Missing fields + Invalid dates) // MODIFIED
  if (!extracted.patient.full_name.value) {
    addError('patient.full_name', 'Patient name is missing', 'critical', []);
  }

  const today = new Date(); // MODIFIED
  if (extracted.patient.dob.value) { // MODIFIED
    const dob = new Date(extracted.patient.dob.value); // MODIFIED
    if (isNaN(dob.getTime())) { // MODIFIED
      addError('patient.dob', 'Patient Date of Birth is invalid', 'high', [extracted.patient.dob.page || 1]); // MODIFIED
    } else if (dob > today) { // MODIFIED
      addError('patient.dob', 'Patient Date of Birth is in the future', 'critical', [extracted.patient.dob.page || 1]); // MODIFIED
    } // MODIFIED
  } else { // MODIFIED
    addError('patient.dob', 'Patient Date of Birth is missing', 'critical', []); // MODIFIED
  } // MODIFIED

  // 2. Hospital & Care validations (LOS mismatch + negative stay + future stay) // MODIFIED
  const { admission_date, discharge_date } = extracted.hospital;
  if (admission_date.value) { // MODIFIED
    const adm = new Date(admission_date.value); // MODIFIED
    if (isNaN(adm.getTime())) { // MODIFIED
      addError('hospital.admission_date', 'Admission Date is invalid', 'high', [admission_date.page || 1]); // MODIFIED
    } else if (adm > today) { // MODIFIED
      addError('hospital.admission_date', 'Admission Date is in the future', 'high', [admission_date.page || 1]); // MODIFIED
    } // MODIFIED

    if (extracted.patient.dob.value) { // MODIFIED
      const dob = new Date(extracted.patient.dob.value); // MODIFIED
      if (!isNaN(dob.getTime()) && !isNaN(adm.getTime()) && dob >= adm) { // MODIFIED
        addError('patient.dob', 'Date of Birth must be before admission date', 'critical', [extracted.patient.dob.page || 1, admission_date.page || 1]); // MODIFIED
      } // MODIFIED
    } // MODIFIED
  } else { // MODIFIED
    addError('hospital.admission_date', 'Admission Date is missing', 'high', []); // MODIFIED
  } // MODIFIED

  if (discharge_date.value) { // MODIFIED
    const dis = new Date(discharge_date.value); // MODIFIED
    if (isNaN(dis.getTime())) { // MODIFIED
      addError('hospital.discharge_date', 'Discharge Date is invalid', 'high', [discharge_date.page || 1]); // MODIFIED
    } else if (dis > today) { // MODIFIED
      addError('hospital.discharge_date', 'Discharge Date is in the future', 'high', [discharge_date.page || 1]); // MODIFIED
    } // MODIFIED
  } // MODIFIED

  if (admission_date.value && discharge_date.value) {
    const los = daysBetween(admission_date.value, discharge_date.value);
    if (los !== null && los < 0) {
      addError(
        'hospital.admission_date',
        'Admission date is after discharge date',
        'critical',
        [admission_date.page || 1, discharge_date.page || 1].filter(Boolean) as number[],
        ['hospital.discharge_date']
      );
      addSuggestion(
        'hospital.admission_date',
        discharge_date.value,
        'Swap dates to fix negative length of stay',
        80
      );
    } else if (los !== null && extracted.clinical.length_of_stay.value !== null) {
      if (los !== extracted.clinical.length_of_stay.value) {
        addError(
          'clinical.length_of_stay',
          `Calculated LOS (${los}) does not match extracted LOS (${extracted.clinical.length_of_stay.value})`,
          'high',
          [extracted.clinical.length_of_stay.page || 1]
        );
        addSuggestion(
          'clinical.length_of_stay',
          String(los),
          `Use calculated LOS based on admission/discharge dates`,
          90
        );
      }
    }
  }

  // 3. Policy Mismatch validations // MODIFIED
  const { policy_number, member_id } = extracted.insurance; // MODIFIED
  if (policy_number.value && member_id.value && policy_number.value === member_id.value) { // MODIFIED
    addError( // MODIFIED
      'insurance.policy_number', // MODIFIED
      'Policy Number and Member ID are identical (potential merged field or copy-paste error)', // MODIFIED
      'critical', // MODIFIED
      [policy_number.page || 1, member_id.page || 1].filter(Boolean) as number[], // MODIFIED
      ['insurance.member_id'] // MODIFIED
    ); // MODIFIED
  } // MODIFIED
  if (!policy_number.value && !member_id.value) { // MODIFIED
    addError('insurance.policy_number', 'Both Policy Number and Member ID are missing', 'critical', []); // MODIFIED
  } else if (!policy_number.value) { // MODIFIED
    addError('insurance.policy_number', 'Policy Number is missing', 'high', []); // MODIFIED
  } else if (!member_id.value) { // MODIFIED
    addError('insurance.member_id', 'Member ID is missing', 'high', []); // MODIFIED
  } // MODIFIED

  // 4. Clinical validations (Primary diagnosis + Duplicate ICD-10) // MODIFIED
  if (!extracted.clinical.diagnosis.value) {
    addError('clinical.diagnosis', 'Primary diagnosis is missing', 'high', []);
  }

  if (!extracted.clinical.icd10_codes.value || extracted.clinical.icd10_codes.value.length === 0) {
    addError('clinical.icd10_codes', 'No ICD-10 codes found', 'medium', []);
  } else {
    // Check for duplicate ICD codes
    const uniqueCodes = new Set(extracted.clinical.icd10_codes.value);
    if (uniqueCodes.size !== extracted.clinical.icd10_codes.value.length) {
      addError('clinical.icd10_codes', 'Duplicate ICD-10 codes found', 'low', [
        extracted.clinical.icd10_codes.page || 1,
      ]);
      addSuggestion(
        'clinical.icd10_codes',
        Array.from(uniqueCodes).join(', '),
        'Remove duplicate codes',
        95
      );
    }
  }

  // 5. Financial validations (Billing mismatch) // MODIFIED
  const { total_claimed, final_bill, room_rent, icu_charges, medicine, investigations, professional_fees } = // MODIFIED
    extracted.financial;
  if (!total_claimed.value && !final_bill.value) {
    addError(
      'financial.total_claimed',
      'No total claimed amount or final bill found',
      'critical',
      []
    );
  } else if (total_claimed.value && final_bill.value && total_claimed.value !== final_bill.value) {
    addError(
      'financial.total_claimed',
      `Total claimed (${total_claimed.value}) does not match final bill (${final_bill.value})`,
      'high',
      [total_claimed.page || 1, final_bill.page || 1].filter(Boolean) as number[]
    );
  }

  // Calculate sum of parts // MODIFIED
  let sumOfParts = 0;
  if (room_rent.value) sumOfParts += room_rent.value;
  if (icu_charges.value) sumOfParts += icu_charges.value;
  if (medicine.value) sumOfParts += medicine.value;
  if (investigations.value) sumOfParts += investigations.value;
  if (professional_fees.value) sumOfParts += professional_fees.value; // MODIFIED

  const referenceTotal = total_claimed.value || final_bill.value;
  if (referenceTotal && sumOfParts > referenceTotal) {
    addError(
      'financial',
      `Sum of component charges (${sumOfParts}) exceeds total claimed (${referenceTotal})`,
      'high',
      []
    );
  }

  // 6. Authorization validations (Missing signatures) // MODIFIED
  if (!extracted.authorization.patient_signature.value) {
    addError('authorization.patient_signature', 'Patient signature is missing or not detected', 'low', []); // Cannot be reliably detected from text OCR
  }
  if (!extracted.authorization.doctor_signature.value) {
    addError('authorization.doctor_signature', 'Doctor signature is missing or not detected', 'low', []); // Cannot be reliably detected from text OCR
  }

  return { errors, repairSuggestions: suggestions };
}
