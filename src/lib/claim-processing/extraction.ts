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
        classification.type === 'unknown' ? 12 : isPreferredPageType ? 0 : 20;

      const regex = toGlobalRegex(pattern.regex);
      for (const match of pageText.matchAll(regex)) {
        const raw = cleanValue(capturedValue(match));
        const value = pattern.normalize ? pattern.normalize(raw, pageText) : (raw as T);
        if (value === null || value === undefined || String(value).trim().length === 0) continue;

        const pageBonus = isPreferredPageType ? 8 : 0;
        const extractionBonus = page.method === 'pdf_text' ? 5 : Math.round(page.confidence / 12);
        const confidence = clamp(
          (pattern.confidence || 75) +
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

  // Return the candidate with highest confidence score
  return candidates.sort((a, b) => b.confidence - a.confidence)[0];
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
        classification.type === 'unknown' ? 12 : isPreferredPageType ? 0 : 20;

      const regex = toGlobalRegex(pattern.regex);
      for (const match of pageText.matchAll(regex)) {
        const raw = cleanValue(capturedValue(match));
        const value = pattern.normalize ? pattern.normalize(raw, pageText) : (raw as T);
        if (value === null || value === undefined || String(value).trim().length === 0) continue;

        const pageBonus = isPreferredPageType ? 8 : 0;
        const extractionBonus = page.method === 'pdf_text' ? 5 : Math.round(page.confidence / 12);
        const confidence = clamp(
          (pattern.confidence || 75) +
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
      full_name: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:patient|insured|beneficiary)\s*name\s*[:\-]\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4})/i, normalize: text, confidence: 95, pageTypes: ['preauth_form', 'claim_form', 'discharge_summary'] },
        { regex: /(?:name\s*of\s*(?:the\s*)?patient)\s*[:\-]\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4})/i, normalize: text, confidence: 92 },
        { regex: /\bname\s*[:\-]\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4})/i, normalize: text, confidence: 85 }
      ]), null),
      dob: makeTrace(findCandidate(pages, classifications, [
        { regex: /\b(?:dob|date\s*of\s*birth|birth\s*date)\s*[:\-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i, normalize: normalizeDate, confidence: 95 },
        { regex: /\bborn\s*on\s*[:\-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i, normalize: normalizeDate, confidence: 90 }
      ]), null),
      gender: makeTrace(findCandidate(pages, classifications, [
        { regex: /\b(?:sex|gender)\s*[:\-]\s*\b(male|female|other|m|f)\b/i, normalize: (v) => (v.charAt(0).toUpperCase() === 'M' ? 'Male' : v.charAt(0).toUpperCase() === 'F' ? 'Female' : 'Other'), confidence: 90 }
      ]), null),
      age: makeTrace(findCandidate(pages, classifications, [
        { regex: /\bage\s*[:\-]\s*(\d{1,2})\b/i, normalize: (v) => parseInt(v, 10) || null, confidence: 90 },
        { regex: /\b(\d{1,2})\s*(?:years|yrs|y\.o\.)\b/i, normalize: (v) => parseInt(v, 10) || null, confidence: 85 }
      ]), null),
      phone: makeTrace(findCandidate(pages, classifications, [
        { regex: /\b(?:phone|mobile|contact|tel|telephone)\s*(?:no|number)?\s*[:\-]\s*(\+?\d[\d\s().-]{7,18})/i, normalize: text, confidence: 90 }
      ]), null),
      address: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:residence|address|addr)\s*[:\-]\s*([^\n:]{10,80})/i, normalize: text, confidence: 85 }
      ]), null)
    },
    insurance: {
      provider_name: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:insurance\s*company|insurer|provider\s*name|insurance\s*provider)\s*[:\-]\s*([A-Za-z0-9\s.,-]{3,40})/i, normalize: text, confidence: 90 }
      ]), null),
      tpa_name: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:tpa\s*name|tpa|third\s*party\s*administrator)\s*[:\-]\s*([A-Za-z0-9\s.,-]{3,40})/i, normalize: text, confidence: 90 }
      ]), null),
      policy_number: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:policy\s*(?:no|number|num)?)\s*[:\-]\s*([A-Z0-9-]{5,20})/i, normalize: identifier, confidence: 95 }
      ]), null),
      member_id: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:member\s*(?:id|no|number|num)?|health\s*id|uhid)\s*[:\-]\s*([A-Z0-9-]{5,25})/i, normalize: identifier, confidence: 95 }
      ]), null),
      corporate_or_group_id: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:group\s*(?:id|no|number|num)?|corporate\s*id)\s*[:\-]\s*([A-Z0-9-]{4,20})/i, normalize: identifier, confidence: 90 }
      ]), null),
      insurance_id: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:insurance\s*id|policy\s*id)\s*[:\-]\s*([A-Z0-9-]{5,25})/i, normalize: identifier, confidence: 90 }
      ]), null)
    },
    hospital: {
      facility_name: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:hospital|facility|clinic|nursing\s*home)\s*name\s*[:\-]\s*([A-Za-z0-9\s.,-]{4,55})/i, normalize: text, confidence: 90 }
      ]), null),
      doctor_name: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:doctor|physician|surgeon|consultant)\s*name\s*[:\-]\s*([A-Za-z\s.'-]{4,40})/i, normalize: text, confidence: 90 },
        { regex: /\b(?:dr\.?|doctor)\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3})/i, normalize: text, confidence: 85 }
      ]), null),
      registration_number: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:reg\s*(?:no|number)?|registration|rohini\s*id)\s*[:\-]\s*([A-Z0-9/-]{5,20})/i, normalize: identifier, confidence: 90 }
      ]), null),
      admission_date: makeTrace(findCandidate(pages, classifications, [
        { regex: /\b(?:doa|date\s*of\s*admission|admission\s*date|admitted\s*on)\s*[:\-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i, normalize: normalizeDate, confidence: 95 }
      ]), null),
      discharge_date: makeTrace(findCandidate(pages, classifications, [
        { regex: /\b(?:dod|date\s*of\s*discharge|discharge\s*date|discharged\s*on)\s*[:\-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i, normalize: normalizeDate, confidence: 95 }
      ]), null),
    },
    clinical: {
      diagnosis: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:diagnosis|ailment|provisional\s*diagnosis|disease)\s*[:\-]\s*([A-Za-z0-9\s.,()-]{4,80})/i, normalize: text, confidence: 90 }
      ]), null),
      icd10_codes: makeTrace({ value: uniqueIcd.length ? uniqueIcd : null, confidence: icdCandidates[0]?.confidence || 0, page: icdCandidates[0]?.page || 1, docType: icdCandidates[0]?.docType || 'unknown', method: icdCandidates[0]?.method || 'ocr', raw: icdCandidates[0]?.raw || '' }, null),
      symptoms: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:symptoms|complaints|presenting\s*with)\s*[:\-]\s*([A-Za-z0-9\s.,()-]{4,80})/i, normalize: text, confidence: 90 }
      ]), null),
      surgery: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:surgery|operation)\s*[:\-]\s*([A-Za-z0-9\s.,()-]{3,80})/i, normalize: text, confidence: 90 }
      ]), null),
      procedure: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:procedure)\s*[:\-]\s*([A-Za-z0-9\s.,()-]{3,80})/i, normalize: text, confidence: 90 }
      ]), null),
      length_of_stay: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:length\s*of\s*stay|los|days\s*in\s*hospital|stay\s*duration)\s*[:\-]\s*(\d{1,2})\b/i, normalize: (v) => parseInt(v, 10), confidence: 90 }
      ]), null),
      emergency_case: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:emergency|casualty|urgent)\s*case?\s*[:\-]\s*(yes|no|true|false|1|0)/i, normalize: isChecked, confidence: 90 }
      ]), null),
    },
    financial: {
      room_rent: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:room\s*rent|ward\s*charges|room\s*charges)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      icu_charges: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:icu\s*charges|icu\s*rent|intensive\s*care\s*charges)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      ot_charges: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:ot\s*charges|operation\s*theatre\s*charges)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      medicine: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:medicine|pharmacy|drugs|pharmacy\s*charges)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      investigations: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:investigation|lab|pathology|radiology|diagnostics)\s*charges?\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      professional_fees: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:professional\s*fees?|doctor\s*fees?|consultation\s*fees?)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 90 }
      ]), null),
      final_bill: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:final\s*bill|grand\s*total|net\s*amount|total\s*invoice)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 95 }
      ]), null),
      total_claimed: makeTrace(findCandidate(pages, classifications, [
        { regex: /(?:amount\s*claimed|total\s*claim|claim\s*amount)\s*[:\-]?\s*(?:rs|inr|₹)?\s*([\d,]+\.?\d*)/i, normalize: parseMoney, confidence: 95 }
      ]), null),
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
