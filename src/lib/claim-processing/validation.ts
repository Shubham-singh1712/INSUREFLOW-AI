import { ExtractedFields, ValidationError, RepairSuggestion, Severity, ClaimPacket } from './types';
import { daysBetween } from './utils';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function validateExtractedData(
  extracted: ExtractedFields,
  pagesCount: number
): { errors: ValidationError[]; repairSuggestions: RepairSuggestion[] } {
  const errors: ValidationError[] = [];
  const suggestions: RepairSuggestion[] = [];

  const addError = (field: string, issue: string, severity: Severity, pages: number[], relatedFields?: string[], fix?: string) => {
    errors.push({ field, issue, severity, pages, relatedFields, suggestedAction: fix });
  };

  const addSuggestion = (fieldId: string, suggestion: string, reason: string, confidence: number) => {
    suggestions.push({ fieldId, suggestion, reason, confidence });
  };

  // Patient validation
  if (!extracted.patient.full_name.value) {
    addError('patient.full_name', 'Patient name is missing', 'critical', []);
  }

  // Hospital Validation
  const { admission_date, discharge_date } = extracted.hospital;
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
      addSuggestion('hospital.admission_date', discharge_date.value, 'Swap dates to fix negative length of stay', 80);
    } else if (los !== null && extracted.clinical.length_of_stay.value !== null) {
      if (los !== extracted.clinical.length_of_stay.value) {
        addError(
          'clinical.length_of_stay',
          `Calculated LOS (${los}) does not match extracted LOS (${extracted.clinical.length_of_stay.value})`,
          'high',
          [extracted.clinical.length_of_stay.page || 1]
        );
        addSuggestion('clinical.length_of_stay', String(los), `Use calculated LOS based on admission/discharge dates`, 90);
      }
    }
  }

  // Clinical Validation
  if (!extracted.clinical.diagnosis.value) {
    addError('clinical.diagnosis', 'Primary diagnosis is missing', 'high', []);
  }
  
  if (!extracted.clinical.icd10_codes.value || extracted.clinical.icd10_codes.value.length === 0) {
    addError('clinical.icd10_codes', 'No ICD-10 codes found', 'medium', []);
  } else {
    // Check for duplicate ICD codes
    const uniqueCodes = new Set(extracted.clinical.icd10_codes.value);
    if (uniqueCodes.size !== extracted.clinical.icd10_codes.value.length) {
      addError('clinical.icd10_codes', 'Duplicate ICD-10 codes found', 'low', [extracted.clinical.icd10_codes.page || 1]);
      addSuggestion('clinical.icd10_codes', Array.from(uniqueCodes).join(', '), 'Remove duplicate codes', 95);
    }
  }

  // Financial Validation
  const { total_claimed, final_bill, room_rent, icu_charges, medicine, investigations } = extracted.financial;
  if (!total_claimed.value && !final_bill.value) {
    addError('financial.total_claimed', 'No total claimed amount or final bill found', 'critical', []);
  } else if (total_claimed.value && final_bill.value && total_claimed.value !== final_bill.value) {
    addError(
      'financial.total_claimed',
      `Total claimed (${total_claimed.value}) does not match final bill (${final_bill.value})`,
      'high',
      [total_claimed.page || 1, final_bill.page || 1].filter(Boolean) as number[]
    );
  }

  // Calculate sum of parts
  let sumOfParts = 0;
  if (room_rent.value) sumOfParts += room_rent.value;
  if (icu_charges.value) sumOfParts += icu_charges.value;
  if (medicine.value) sumOfParts += medicine.value;
  if (investigations.value) sumOfParts += investigations.value;

  const referenceTotal = total_claimed.value || final_bill.value;
  if (referenceTotal && sumOfParts > referenceTotal) {
    addError(
      'financial',
      `Sum of component charges (${sumOfParts}) exceeds total claimed (${referenceTotal})`,
      'high',
      []
    );
  }

  // Authorization Validation
  if (!extracted.authorization.patient_signature.value) {
    addError('authorization.patient_signature', 'Patient signature is missing', 'medium', []);
  }
  if (!extracted.authorization.doctor_signature.value) {
    addError('authorization.doctor_signature', 'Doctor signature is missing', 'high', []);
  }

  return { errors, repairSuggestions: suggestions };
}
