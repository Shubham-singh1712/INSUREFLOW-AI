import { PageText, ClassifiedPage, ExtractedFields, TraceableField, Pattern, Candidate, PageDocType } from './types';
import { cleanValue, capturedValue, toGlobalRegex, clamp, parseMoney, normalizeDate, normalizeWhitespace } from './utils';
import { logger } from './logger';

const makeEmptyTrace = <T>(value: T): TraceableField<T> => ({
  value,
  confidence: 0,
  page: null,
  docType: null,
  method: null,
  raw: null
});

const makeTrace = <T>(candidate: Candidate<T> | null, emptyValue: T): TraceableField<T> => {
  if (!candidate) return makeEmptyTrace(emptyValue);
  return {
    value: candidate.value,
    confidence: clamp(candidate.confidence),
    page: candidate.page,
    docType: candidate.docType,
    method: candidate.method,
    raw: candidate.raw
  };
};

function findCandidate<T>(
  pages: PageText[],
  classifications: ClassifiedPage[],
  patterns: Pattern<T>[]
): Candidate<T> | null {
  const candidates: Candidate<T>[] = [];

  for (const page of pages) {
    const classification = classifications.find((c) => c.page === page.page) || {
      page: page.page,
      type: 'unknown' as PageDocType,
      confidence: 0,
    };
    const pageText = normalizeWhitespace(page.text);
    if (!pageText) continue;

    for (const pattern of patterns) {
      const isPreferredPageType = pattern.pageTypes?.includes(classification.type) ?? true;
      const classificationPenalty =
        classification.type === 'unknown' ? 12 : isPreferredPageType ? 0 : 25;

      const regex = toGlobalRegex(pattern.regex);
      for (const match of pageText.matchAll(regex)) {
        const raw = cleanValue(capturedValue(match));
        const value = pattern.normalize ? pattern.normalize(raw, pageText) : (raw as T);
        if (value === null || value === undefined || String(value).trim().length === 0) continue;

        const pageBonus = isPreferredPageType ? 8 : 0;
        const extractionBonus = page.method === 'pdf_text' ? 4 : Math.round(page.confidence / 12);
        const confidence = clamp(
          (pattern.confidence || 78) +
            pageBonus +
            Math.min(8, Math.round(classification.confidence / 16)) +
            extractionBonus -
            classificationPenalty
        );

        const candidate = {
          value,
          raw,
          page: page.page,
          docType: classification.type,
          method: page.method,
          confidence,
        };
        
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  return best;
}

function findAllCandidates<T>(
  pages: PageText[],
  classifications: ClassifiedPage[],
  patterns: Pattern<T>[]
): Candidate<T>[] {
  const all: Candidate<T>[] = [];
  for (const page of pages) {
    const classification = classifications.find((c) => c.page === page.page) || {
      page: page.page,
      type: 'unknown' as PageDocType,
      confidence: 0,
    };
    const pageText = normalizeWhitespace(page.text);
    if (!pageText) continue;

    for (const pattern of patterns) {
      const isPreferredPageType = pattern.pageTypes?.includes(classification.type) ?? true;
      const classificationPenalty =
        classification.type === 'unknown' ? 12 : isPreferredPageType ? 0 : 25;

      const regex = toGlobalRegex(pattern.regex);
      for (const match of pageText.matchAll(regex)) {
        const raw = cleanValue(capturedValue(match));
        const value = pattern.normalize ? pattern.normalize(raw, pageText) : (raw as T);
        if (value === null || value === undefined || String(value).trim().length === 0) continue;

        const pageBonus = isPreferredPageType ? 8 : 0;
        const extractionBonus = page.method === 'pdf_text' ? 4 : Math.round(page.confidence / 12);
        const confidence = clamp(
          (pattern.confidence || 78) +
            pageBonus +
            Math.min(8, Math.round(classification.confidence / 16)) +
            extractionBonus -
            classificationPenalty
        );

        all.push({
          value,
          confidence,
          page: page.page,
          docType: classification.type,
          method: page.method,
          raw,
        });
      }
    }
  }
  return all.sort((a, b) => b.confidence - a.confidence);
}

const text = (v: string) => v;
const identifier = (v: string) => v.toUpperCase().replace(/[^A-Z0-9-]/g, '');

export function extractEntities(pages: PageText[], classifications: ClassifiedPage[]): ExtractedFields {
  logger.info('EXTRACTION', 'Starting entity extraction');

  const icdCandidates = findAllCandidates<string>(pages, classifications, [
    {
      regex: /(?:icd[- ]?10|code)[\s:]*([A-Z][0-9][0-9A-Z]?(?:\.[0-9A-Z]{1,4})?)/gi,
      normalize: identifier,
      confidence: 90,
      pageTypes: ['discharge_summary', 'preauth_form', 'ub04', 'claim_form'],
    },
  ]);
  const uniqueIcd = Array.from(new Set(icdCandidates.map((item) => item.value))).slice(0, 12);

  const isChecked = (val: string) => /yes|true|1|checked|\[x\]|\(x\)/i.test(val);

  const extracted: ExtractedFields = {
    patient: {
      full_name: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:name|patient|insured|beneficiary)[^:\n]{0,15}[:\-]?\s*((?:mr|mrs|ms|dr)?\.?\s*[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,5})/i, normalize: text, confidence: 88, pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'insurance_card'] }]), null),
      dob: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:dob|date\s*of\s*birth|birth\s*date|born)[^:\n]{0,10}[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4}|[A-Za-z]{3,9}\s*\d{1,2},?\s*\d{2,4})/i, normalize: normalizeDate, confidence: 90, pageTypes: ['aadhaar', 'pan', 'claim_form', 'preauth_form', 'insurance_card'] }]), null),
      gender: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:sex|gender)\s*[:\-]?\s*(male|female|m|f|transgender|other)\b/i, normalize: (v) => (v.charAt(0).toUpperCase() === 'M' ? 'Male' : v.charAt(0).toUpperCase() === 'F' ? 'Female' : 'Other'), confidence: 85 }]), null),
      age: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:age)\s*[:\-]?\s*(\d{1,3})\s*(?:yrs|years|y)?/i, normalize: (v) => parseInt(v, 10) || null, confidence: 80 }]), null),
      phone: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:phone|mobile|contact|tel)[^:\n]{0,10}[:\-]?\s*(\+?\d[\d\s().-]{7,})/i, normalize: text, confidence: 82 }]), null),
      address: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:address|residence|addr)[^:\n]{0,10}[:\-]?\s*([\s\S]{10,100}?)(?=\n[A-Z][a-z]+:|$)/i, normalize: text, confidence: 75 }]), null)
    },
    insurance: {
      provider_name: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:insurance\s*company|insurer|provider)\s*[:\-]?\s*([A-Za-z0-9\s.,-]+?)(?=\n|$)/i, normalize: text, confidence: 85 }]), null),
      tpa_name: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:tpa|third\s*party\s*administrator)\s*[:\-]?\s*([A-Za-z0-9\s.,-]+?)(?=\n|$)/i, normalize: text, confidence: 85 }]), null),
      policy_number: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:policy|certificate)[^:\n]{0,15}[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i, normalize: identifier, confidence: 90 }]), null),
      member_id: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:member\s*id|uhid|health\s*id)[^:\n]{0,15}[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i, normalize: identifier, confidence: 90 }]), null),
      corporate_or_group_id: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:group\s*id|corporate\s*id|emp\s*id)[^:\n]{0,15}[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{3,30})/i, normalize: identifier, confidence: 80 }]), null),
      insurance_id: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:insurance\s*id)[^:\n]{0,15}[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i, normalize: identifier, confidence: 85 }]), null)
    },
    hospital: {
      facility_name: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:hospital|facility|clinic|nursing\s*home)\s*name\s*[:\-]?\s*([A-Za-z0-9\s.,-]+?)(?=\n|$)/i, normalize: text, confidence: 85 }]), null),
      doctor_name: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:doctor|physician|consultant|surgeon)[^:\n]{0,15}[:\-]?\s*((?:dr\.?)\s*[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4})/i, normalize: text, confidence: 85 }]), null),
      registration_number: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:rohini|reg\s*no|registration)[^:\n]{0,15}[:\-]?\s*([A-Z0-9/-]{5,20})/i, normalize: identifier, confidence: 80 }]), null),
      admission_date: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:doa|date\s*of\s*admission|admitted\s*on)[^:\n]{0,10}[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4})/i, normalize: normalizeDate, confidence: 90 }]), null),
      discharge_date: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:dod|date\s*of\s*discharge|discharged\s*on)[^:\n]{0,10}[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4})/i, normalize: normalizeDate, confidence: 90 }]), null),
    },
    clinical: {
      diagnosis: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:diagnosis|ailment|provisional\s*diagnosis|disease)[^:\n]{0,10}[:\-]?\s*([\s\S]{5,100}?)(?=\n[A-Z][a-z]+:|$)/i, normalize: text, confidence: 80 }]), null),
      icd10_codes: makeTrace({ value: uniqueIcd.length ? uniqueIcd : null, confidence: icdCandidates[0]?.confidence || 0, page: icdCandidates[0]?.page || 1, docType: icdCandidates[0]?.docType || 'unknown', method: icdCandidates[0]?.method || 'ocr', raw: icdCandidates[0]?.raw || '' }, null),
      symptoms: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:symptoms|complaints|presenting\s*with)[^:\n]{0,10}[:\-]?\s*([\s\S]{5,100}?)(?=\n[A-Z][a-z]+:|$)/i, normalize: text, confidence: 75 }]), null),
      surgery: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:surgery|operation)[^:\n]{0,10}[:\-]?\s*([\s\S]{5,100}?)(?=\n[A-Z][a-z]+:|$)/i, normalize: text, confidence: 80 }]), null),
      procedure: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:procedure)[^:\n]{0,10}[:\-]?\s*([\s\S]{5,100}?)(?=\n[A-Z][a-z]+:|$)/i, normalize: text, confidence: 80 }]), null),
      length_of_stay: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:length\s*of\s*stay|los|days\s*in\s*hospital)[^:\n]{0,10}[:\-]?\s*(\d{1,3})/i, normalize: (v) => parseInt(v, 10), confidence: 80 }]), null),
      emergency_case: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:emergency|casualty|urgent)[^:\n]{0,10}[:\-]?\s*(yes|no|true|false|1|0)/i, normalize: isChecked, confidence: 85 }]), null),
    },
    financial: {
      room_rent: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:room\s*rent|ward\s*charges)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      icu_charges: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:icu|intensive\s*care)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      ot_charges: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:ot|operation\s*theatre)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      medicine: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:medicine|pharmacy|drugs)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      investigations: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:investigation|lab|pathology|radiology)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      professional_fees: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:professional|doctor|surgeon|consultation)\s*fees?[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 85 }]), null),
      final_bill: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:final\s*bill|grand\s*total|net\s*amount)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }]), null),
      total_claimed: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:amount\s*claimed|total\s*claim|claim\s*amount)[^:\n]{0,10}[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }]), null),
    },
    authorization: {
      patient_signature: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:signature\s*of\s*(?:the\s*)?patient|patient\s*signature)/i, normalize: () => true, confidence: 60 }]), null),
      doctor_signature: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:signature\s*of\s*(?:the\s*)?doctor|doctor\s*signature)/i, normalize: () => true, confidence: 60 }]), null),
      hospital_seal: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:hospital\s*seal|official\s*seal|stamp)/i, normalize: () => true, confidence: 60 }]), null),
      approval_stamp: makeTrace(findCandidate(pages, classifications, [{ regex: /(?:approved\s*by|approval\s*signature)/i, normalize: () => true, confidence: 60 }]), null),
    }
  };

  logger.info('EXTRACTION', 'Entity extraction completed');
  return extracted;
}
