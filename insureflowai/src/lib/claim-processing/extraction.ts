import {
  PageText,
  ClassifiedPage,
  ExtractedFields,
  TraceableField,
  Pattern,
  Candidate,
  PageDocType,
} from './types';
import {
  cleanValue,
  capturedValue,
  toGlobalRegex,
  clamp,
  parseMoney,
  normalizeDate,
  normalizeWhitespace,
} from './utils';
import { logger } from './logger';

const makeEmptyTrace = <T>(value: T): TraceableField<T> => ({
  value,
  confidence: 0,
  page: null,
  docType: null,
  method: null,
  raw: null,
});

const makeTrace = <T>(candidate: Candidate<T> | null, emptyValue: T): TraceableField<T> => {
  if (!candidate) return makeEmptyTrace(emptyValue);
  return {
    value: candidate.value,
    confidence: clamp(candidate.confidence),
    page: candidate.page,
    docType: candidate.docType,
    method: candidate.method,
    raw: candidate.raw,
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

export function extractEntities( // MODIFIED
  pages: PageText[], // MODIFIED
  classifications: ClassifiedPage[], // MODIFIED
  pythonResult?: any // MODIFIED
): ExtractedFields { // MODIFIED
  logger.info('EXTRACTION', 'Starting entity extraction');

  const icdCandidates = findAllCandidates<string>(pages, classifications, [
    {
      // Exact label "ICD 10 code" as seen on the form
      regex: /(?:icd[\s-]?10(?:[\s-]?(?:pcs)?)?\s*code)\s*[:\-_]*\s*([A-Z][0-9][0-9A-Z]?(?:\.[0-9A-Z]{1,4})?)/gi,
      normalize: identifier,
      confidence: 95,
      pageTypes: ['discharge summary', 'preauth', 'UB04'],
    },
    {
      // Generic ICD label
      regex: /(?:icd[- ]?10|diagnosis\s*code)[\s:\-_]*([A-Z][0-9][0-9A-Z]?(?:\.[0-9A-Z]{1,4})?)/gi,
      normalize: identifier,
      confidence: 88,
      pageTypes: ['discharge summary', 'preauth', 'UB04'],
    },
    {
      // Bare ICD-10 pattern (e.g. K35.2, J18.9)
      regex: /\b([A-Z][0-9][0-9A-Z]?\.[0-9A-Z]{1,4})\b/g,
      normalize: identifier,
      confidence: 78,
      pageTypes: ['discharge summary', 'preauth', 'UB04'],
    },
  ]);
  const uniqueIcd = Array.from(new Set(icdCandidates.map((item) => item.value))).slice(0, 12);

  const isChecked = (val: string) => /yes|true|1|checked|\[x\]|\(x\)/i.test(val);

  const extracted: ExtractedFields = {
    patient: {
      full_name: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount form: "Name of the Patient:"
            regex:
              /(?:name\s*of\s*(?:the\s*)?patient|patient['\'s]*\s*(?:\/\s*insured['\'s]*)?\s*name)\s*[:\-_]*[_\s]*([A-Za-z][A-Za-z\s._-]{2,50})/i,
            normalize: text,
            confidence: 97,
            pageTypes: ['preauth'],
          },
          {
            // Medi Assist Part C: "a) Name of the patient:"
            regex:
              /(?:a\)?\s*)?name\s*of\s*the\s*patient\s*[:\-_]*[_\s]*([A-Za-z][A-Za-z\s._-]{2,50})/i,
            normalize: text,
            confidence: 95,
          },
          {
            // Declaration section: "Patient's / Insured's Name"
            regex:
              /(?:patient['\'s\s]+\/\s*insured['\'s\s]+name|patient['\'s\s]+name)\s*[:\-_]*[_\s]*([A-Za-z][A-Za-z\s._-]{2,50})/i,
            normalize: text,
            confidence: 90,
          },
          {
            // Generic fallback
            regex:
              /(?:insured|beneficiary)\s*name\s*[:\-_]*[_\s]*([A-Za-z][A-Za-z\s._-]{2,50})/i,
            normalize: text,
            confidence: 85,
          },
        ]),
        null
      ),
      dob: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Both forms: "Date of Birth" with DD/MM/YYYY or DD|MM|YYYY
            regex:
              /\b(?:f\s*\)?\s*)?(?:date\s*of\s*birth|dob|d\.o\.b)\s*[:\-_\.]*\s*(\d{1,2}[/\-.|\s]\d{1,2}[/\-.|\s]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 95,
          },
          {
            regex:
              /\bborn\s*on\s*[:\-_\.]*\s*(\d{1,2}[/\-.\s]\d{1,2}[/\-.\s]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 88,
          },
          {
            // Policy schedule: "Date of birth" in table (e.g. 27/04/198...)
            regex: /date\s*of\s*birth[\s\S]{0,30}?(\d{1,2}\/\d{1,2}\/\d{4})/i,
            normalize: normalizeDate,
            confidence: 82,
          },
        ]),
        null
      ),
      gender: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount form: checkbox style "Gender: [✓]Male  [ ]Female"
            regex: /\b(?:sex|gender)\s*[:\-_]*\s*\[?(?:✓|x|v|\/)\]?\s*(male|female|other)\b/i,
            normalize: (v) =>
              v.toLowerCase() === 'male' ? 'Male' : v.toLowerCase() === 'female' ? 'Female' : 'Other',
            confidence: 95,
          },
          {
            // Medi Assist Part C: "Gender: [✓]Male [ ]Female [ ]Third gender"
            regex: /gender\s*[:\-_]*\s*(?:\[?(?:✓|x|v|\/)?\]?\s*)?(male|female)/i,
            normalize: (v) => (v.toLowerCase() === 'male' ? 'Male' : 'Female'),
            confidence: 90,
          },
          {
            regex: /\b(?:sex|gender)\s*[:\-_]*[_\s]*\b(male|female|other|m|f)\b/i,
            normalize: (v) =>
              v.charAt(0).toUpperCase() === 'M'
                ? 'Male'
                : v.charAt(0).toUpperCase() === 'F'
                  ? 'Female'
                  : 'Other',
            confidence: 85,
          },
        ]),
        null
      ),
      age: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount form: "Age: Years 31  Months 03"
            regex: /\bage\s*[:\-_]*\s*(?:years?|yrs?)?\.?\s*(\d{1,3})\s*(?:years?|yrs?|months?|mo)?/i,
            normalize: (v) => parseInt(v, 10) || null,
            confidence: 90,
          },
          {
            // Medi Assist: "e) Age: Years [38] Months [11]"
            regex: /age\s*[:\-_]*\s*years?\s*[:\-_]?\s*(\d{1,3})/i,
            normalize: (v) => parseInt(v, 10) || null,
            confidence: 92,
          },
          {
            // Policy schedule table age column
            regex: /(?:age|yrs)\s*[|\s]+(\d{1,3})\s*[|\s]+(?:m|f|male|female)/i,
            normalize: (v) => parseInt(v, 10) || null,
            confidence: 85,
          },
          {
            regex: /\b(\d{1,3})\s*(?:years?|yrs?|y\.o\.)\b/i,
            normalize: (v) => parseInt(v, 10) || null,
            confidence: 80,
          },
        ]),
        null
      ),
      phone: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Contact number: 8928256371"
            regex:
              /(?:contact\s*(?:number|no\.?)?|phone|mobile|tel(?:ephone)?)\s*[:\-_]*[_\s]*(\d[\d\s]{8,14})/i,
            normalize: (v) => v.replace(/\s+/g, '').trim(),
            confidence: 92,
          },
          {
            // Medi Assist: "c) Contact no.: 9359417484"
            regex: /c\)?\s*contact\s*no\.?\s*[:\-_]*\s*(\d[\d\s]{8,14})/i,
            normalize: (v) => v.replace(/\s+/g, '').trim(),
            confidence: 95,
          },
          {
            // Declaration: "Contact number  8928256371"
            regex: /(?:contact\s*number)\s*(\d{10,12})/i,
            normalize: text,
            confidence: 88,
          },
        ]),
        null
      ),
      address: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Current Address of Insured Patient:"
            regex:
              /(?:current\s*address|address\s*of\s*(?:insured|patient)|residence|addr)\s*[:\-_]*[_\s]*([^\n:]{10,120})/i,
            normalize: text,
            confidence: 88,
          },
          {
            // Policy schedule: "Policyholder's address"
            regex: /policyholder['\'s\s]*address\s*[:\-_]*[_\s]*([^\n]{10,120})/i,
            normalize: text,
            confidence: 85,
          },
        ]),
        null
      ),
    },
    insurance: {
      provider_name: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Policy schedule header: "New India Mediclaim Policy" / "The New India Assurance Co. Ltd."
            regex:
              /(?:name\s*of\s*(?:the\s*)?(?:tpa|insurance)\s*company|insurance\s*company|insurer|insurance\s*provider)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_&-]{3,60})/i,
            normalize: text,
            confidence: 90,
          },
          {
            // Policy schedule: "New India Assurance" / "Star Health" etc in header
            regex: /^(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*(?:assurance|insurance|health|life)\s*(?:co\.?|ltd\.?|pvt\.?|limited)?)/m,
            normalize: text,
            confidence: 85,
          },
        ]),
        null
      ),
      tpa_name: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount form: "Name of TPA/Insurance company: PARAMOUNT HEALTH SERVICES"
            regex:
              /(?:name\s*of\s*(?:the\s*)?(?:tpa|insurance\s*company)|a\)?\s*name\s*of\s*tpa\s*company)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_&-]{3,70})/i,
            normalize: text,
            confidence: 93,
          },
          {
            // Medi Assist header: "Medi Assist Insurance TPA Pvt Ltd"
            regex: /(?:medi\s*assist|paramount|good\s*health|heritage|family\s*health)[\s\S]{0,20}(?:tpa|insurance|health\s*services)/i,
            normalize: text,
            confidence: 88,
          },
          {
            regex:
              /(?:tpa\s*name|tpa)\b\s*[/_\s\w]*[:\-_]*[_\s]*([A-Za-z0-9\s.,_&-]{3,60})/i,
            normalize: text,
            confidence: 85,
          },
        ]),
        null
      ),
      policy_number: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "h) Policy number/Name of Corporate: 11250061259500003325"
            regex:
              /(?:h\)?\s*)?policy\s*(?:number|no\.?|num)\s*(?:\/\s*name\s*of\s*corporate)?\s*[:\-_]*[_\s]*([A-Z0-9-]{5,25})/i,
            normalize: identifier,
            confidence: 97,
          },
          {
            // Policy schedule: "Policy No   11250061259500003325"
            regex: /policy\s*no\.?\s*[:\-_|\s]\s*([A-Z0-9-]{8,25})/i,
            normalize: identifier,
            confidence: 95,
          },
          {
            // Generic fallback
            regex: /policy\s*(?:no|number|num)?\.?\s*[:\-_]*[_\s]*([A-Z0-9/-]{5,25})/i,
            normalize: identifier,
            confidence: 88,
          },
        ]),
        null
      ),
      member_id: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Insured Card ID number: 45759789"
            regex:
              /(?:g\)?\s*)?(?:insured\s*card\s*(?:id|no\.?)\s*(?:number)?|insurer\s*id\s*card\s*no\.?)\s*[:\-_]*[_\s]*([A-Z0-9-]{4,20})/i,
            normalize: identifier,
            confidence: 97,
          },
          {
            // Medi Assist: "g) Insurer ID card no.:"
            regex: /g\)?\s*insurer\s*id\s*card\s*no\.?\s*[:\-_]*\s*([A-Z0-9-]{4,20})/i,
            normalize: identifier,
            confidence: 97,
          },
          {
            // Policy schedule Customer ID: "Customer ID  ME26298413"
            regex: /customer\s*id\s*[:\-_|\s]+([A-Z0-9-]{4,20})/i,
            normalize: identifier,
            confidence: 92,
          },
          {
            // Generic member ID
            regex:
              /(?:member\s*(?:id|no|number)?|health\s*id|uhid|card\s*(?:id|no|number)?)\s*[:\-_]*[_\s]*([A-Z0-9-]{5,25})/i,
            normalize: identifier,
            confidence: 88,
          },
        ]),
        null
      ),
      corporate_or_group_id: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Employee ID: 833874"
            regex:
              /(?:i\)?\s*)?employee\s*(?:id|no\.?|number)?\s*[:\-_]*[_\s]*([A-Z0-9-]{4,20})/i,
            normalize: identifier,
            confidence: 90,
          },
          {
            regex:
              /(?:group\s*(?:id|no|number)?|corporate\s*id)\s*[:\-_]*[_\s]*([A-Z0-9-]{4,20})/i,
            normalize: identifier,
            confidence: 88,
          },
        ]),
        null
      ),
      insurance_id: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex: /(?:insurance\s*id|policy\s*id)\s*[:\-_]*[_\s]*([A-Z0-9-]{5,25})/i,
            normalize: identifier,
            confidence: 90,
          },
        ]),
        null
      ),
    },
    hospital: {
      facility_name: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "d. Name of Hospital: LIFE CARE HOSPITAL ANNEX"
            regex:
              /(?:d\.?\s*)?name\s*of\s*(?:the\s*)?hospital\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_&-]{4,70})/i,
            normalize: text,
            confidence: 95,
          },
          {
            // Medi Assist: "Name of the hospital: [boxed entry]"
            regex:
              /(?:hospital|facility|clinic|nursing\s*home)\s*name\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_&-]{4,70})/i,
            normalize: text,
            confidence: 90,
          },
          {
            // Large bold header like "LIFE CARE HOSPITAL ANNEX"
            regex: /^([A-Z][A-Z\s]{5,50}(?:HOSPITAL|CLINIC|CENTRE|CENTER|MEDICAL))$/m,
            normalize: text,
            confidence: 80,
          },
        ]),
        null
      ),
      doctor_name: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "A: Name of the treating Doctor: Dr. Swapnil Wahane"
            regex:
              /(?:a\.?\s*)?name\s*of\s*(?:the\s*)?treating\s*(?:doctor|physician|surgeon)\s*[:\-_]*[_\s]*([A-Za-z\s.'-]{4,50})/i,
            normalize: text,
            confidence: 97,
          },
          {
            // Medi Assist: "a) Name of the treating doctor:"
            regex:
              /(?:a\)?\s*)?name\s*of\s*the\s*treating\s*doctor\s*[:\-_]*[_\s]*([A-Za-z\s.'-]{4,50})/i,
            normalize: text,
            confidence: 97,
          },
          {
            // Declaration: "Name of the treating doctor: Dr. Swapnil Wahane / MBBS, DNB"
            regex:
              /name\s*of\s*(?:the\s*)?treating\s*doctor\s*[:\-_]*[_\s]*([A-Za-z\s.'-]{4,50})/i,
            normalize: text,
            confidence: 90,
          },
          {
            // Generic Dr. prefix
            regex: /\bdr\.?\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i,
            normalize: text,
            confidence: 82,
          },
        ]),
        null
      ),
      registration_number: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Rohini ID: REG. NO.:TMC/ZONE-C/570"
            regex:
              /rohini\s*id\s*[:\-_]*[_\s]*([A-Z0-9/\s_-]{3,30})/i,
            normalize: identifier,
            confidence: 95,
          },
          {
            // Paramount address block: "REG. NO.:TMC/ZONE-C/570"
            regex: /reg\.?\s*no\.?\s*[:\-_]*\s*([A-Z0-9/\-]{4,30})/i,
            normalize: identifier,
            confidence: 93,
          },
          {
            // Declaration: "Registration number with State code: Reg. No. 2012051045"
            regex:
              /registration\s*(?:number|no\.?)?\s*(?:with\s*state\s*code)?\s*[:\-_]*\s*(?:reg\.?\s*no\.?)?\s*([A-Z0-9.]{6,20})/i,
            normalize: identifier,
            confidence: 90,
          },
        ]),
        null
      ),
      admission_date: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "A. Date of admission   05/04/26" (page 3)
            regex:
              /(?:a\.?\s*)?date\s*of\s*admission\s*[:\-_\.]*\s*(\d{1,2}[/\-.|]\d{1,2}[/\-.|]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 97,
          },
          {
            // Medi Assist: "a) Date of admission: 03/04/2026"
            regex:
              /(?:a\)?\s*)?date\s*of\s*admission\s*[:\-_\.]*\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 97,
          },
          {
            // Labels: "DOA", "admitted on", "admission date"
            regex:
              /\b(?:doa|admission\s*date|admitted\s*on|date\s*of\s*admit)\s*[:\-_\.]*\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 90,
          },
          {
            // Fallback proximity: word "admission" near a date
            regex: /admission[\s\S]{0,40}?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 80,
            pageTypes: ['preauth', 'discharge summary', 'UB04'],
          },
        ]),
        null
      ),
      discharge_date: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex:
              /(?:date\s*of\s*discharge|discharge\s*date|discharged\s*on|dod)\s*[:\-_\.]*\s*(\d{1,2}[/\-.|]\d{1,2}[/\-.|]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 95,
          },
          {
            regex: /discharge[\s\S]{0,40}?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
            normalize: normalizeDate,
            confidence: 78,
            pageTypes: ['preauth', 'discharge summary', 'UB04'],
          },
        ]),
        null
      ),
    },
    clinical: {
      diagnosis: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "F: Provisional diagnosis: Fistula in ano at 12° c Fissure in ano"
            regex:
              /(?:f\.?\s*)?provisional\s*diagnosis\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()+°&-]{4,120})/i,
            normalize: text,
            confidence: 97,
          },
          {
            // Medi Assist: "f) Provisional diagnosis:"
            regex:
              /f\)?\s*provisional\s*diagnosis\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()+&-]{4,120})/i,
            normalize: text,
            confidence: 97,
          },
          {
            // Generic
            regex:
              /(?:diagnosis|ailment|disease|presenting\s*complaint)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()-]{4,120})/i,
            normalize: text,
            confidence: 88,
          },
        ]),
        null
      ),
      icd10_codes: makeTrace(
        {
          value: uniqueIcd.length ? uniqueIcd : null,
          confidence: icdCandidates[0]?.confidence || 0,
          page: icdCandidates[0]?.page || 1,
          docType: icdCandidates[0]?.docType || 'unknown',
          method: icdCandidates[0]?.method || 'ocr',
          raw: icdCandidates[0]?.raw || '',
        },
        null
      ),
      symptoms: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Nature of Illness / Disease with presenting complaint:"
            regex:
              /(?:c\.?\s*)?nature\s*of\s*illness\s*(?:\/\s*disease)?\s*(?:with\s*presenting\s*complaints?)?\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()-]{4,200})/i,
            normalize: text,
            confidence: 95,
          },
          {
            regex:
              /(?:symptoms?|complaints?|presenting\s*with|c\.?\s*nature)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()-]{4,200})/i,
            normalize: text,
            confidence: 88,
          },
        ]),
        null
      ),
      surgery: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "I: If surgical, name of surgery: Fissurectomy + Fissure Dilatation+"
            regex:
              /(?:i\.?\s*)?if\s*surgical,?\s*name\s*of\s*surgery\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_+()-]{3,120})/i,
            normalize: text,
            confidence: 97,
          },
          {
            // Medi Assist: "i) If Surgical, name of surgery:"
            regex:
              /i\)?\s*if\s*surgical,?\s*name\s*of\s*surgery\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_+()-]{3,120})/i,
            normalize: text,
            confidence: 97,
          },
          {
            regex: /(?:surgery|operation|surgical\s*procedure)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()-]{3,80})/i,
            normalize: text,
            confidence: 88,
          },
        ]),
        null
      ),
      procedure: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex: /(?:procedure)\s*[:\-_]*[_\s]*([A-Za-z0-9\s.,_()-]{3,80})/i,
            normalize: text,
            confidence: 90,
          },
        ]),
        null
      ),
      length_of_stay: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "Expected number of Days/stay in hospital: 2-3 Days"
            regex:
              /(?:expected\s*(?:number\s*of\s*)?days?\s*(?:\/\s*)?stay|los|length\s*of\s*stay|days?\s*in\s*hospital|stay\s*duration)\s*[:\-_]*[_\s]*(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*(?:days?)?/i,
            normalize: (v) => {
              const n = parseInt(v, 10);
              return isNaN(n) ? null : n;
            },
            confidence: 90,
          },
          {
            // Medi Assist: "d) Expected no. of days stay in hospital: 3-4"
            regex:
              /(?:d\)?\s*)?expected\s*no\.?\s*of\s*days?\s*stay\s*in\s*hospital\s*[:\-_]*\s*(\d{1,2})/i,
            normalize: (v) => parseInt(v, 10),
            confidence: 92,
          },
        ]),
        null
      ),
      emergency_case: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex: /(?:emergency|casualty|urgent)\s*case?\s*[:\-_]*[_\s]*(yes|no|true|false|1|0)/i,
            normalize: isChecked,
            confidence: 90,
          },
        ]),
        null
      ),
    },
    financial: {
      room_rent: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "H. Per day room rent + nursing and service charges + patients diet"
            // Medi Assist: "g) Per Day Room Rent + Nursing & Service charges + Patient's Diet: Rs. 14000/-"
            regex:
              /(?:g\.?\s*)?(?:per\s*day\s*)?room\s*rent(?:\s*\+\s*nursing[^\n]{0,50})?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.?[\-\/]?\d*))/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:room\s*rent|ward\s*charges|room\s*charges)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      icu_charges: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "i) ICU Charges: Rs."
            regex:
              /(?:i\)?\s*)?icu\s*charges?\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:intensive\s*care\s*(?:unit\s*)?charges?)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      ot_charges: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "j) OT Charges: Rs. 12000+8000"
            regex:
              /(?:j\)?\s*)?ot\s*charges?\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,+\s]+)/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:operation\s*theatre\s*charges?|ot\s*charges?)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      medicine: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "l) Medicines + Consumables cost of Implants: Rs. 80000/-"
            regex:
              /(?:l\)?\s*)?medicines?\s*(?:\+\s*consumables?[^\n]{0,40})?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:[\/-]?))/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:medicine|pharmacy|drugs|pharmacy\s*charges)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      investigations: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "h) Expected cost for investigation + diagnostics: Rs. 5000/-"
            regex:
              /(?:h\)?\s*)?expected\s*cost\s*(?:of|for)\s*investigation\s*(?:\+\s*diagnostics?)?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:[\/-]?))/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:investigation|lab|pathology|radiology|diagnostics)\s*charges?\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      professional_fees: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Medi Assist: "k) Professional fees Surgeon + Anesthetist fees + Consultation charges: Rs. 50000+15000+3500"
            regex:
              /(?:k\)?\s*)?professional\s*fees?\s*(?:surgeon\s*\+[^\n]{0,60})?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,+\s]+)/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:professional\s*fees?|doctor\s*fees?|consultation\s*fees?|surgeon\s*fees?)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
        ]),
        null
      ),
      final_bill: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Paramount: "P. Sum Total expected cost of hospitalization: 1,07,467/-"
            regex:
              /(?:p\.?\s*)?sum\s*total\s*expected\s*cost\s*(?:of\s*hospitalization)?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:[\/-]?\d*))/i,
            normalize: parseMoney,
            confidence: 97,
          },
          {
            // Medi Assist: "o) Sum Total expected cost of hospitalization: Rs. 197600/-"
            regex:
              /(?:o\)?\s*)?sum\s*total\s*expected\s*cost\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:[\/-]?\d*))/i,
            normalize: parseMoney,
            confidence: 97,
          },
          {
            // All-inclusive package: "n) All inclusive package charges: Rs. 100000/-"
            regex:
              /(?:n\)?\s*)?all[\s-]inclusive\s*package\s*charges?\s*[:\-_]*\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:[\/-]?\d*))/i,
            normalize: parseMoney,
            confidence: 93,
          },
          {
            regex:
              /(?:final\s*bill|grand\s*total|net\s*amount|total\s*invoice|total\s*bill)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 90,
          },
        ]),
        null
      ),
      total_claimed: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex:
              /(?:amount\s*claimed|total\s*claim|claim\s*amount)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 95,
          },
          {
            // Broader fallback: "Total" or "Grand Total" followed by rupee amount
            regex:
              /(?:grand\s*total|net\s*payable|total\s*amount|amount\s*payable|total\s*bill)\s*[:\-_]*[_\s]*(?:rs\.?|inr|₹)?\s*([\d,]+\.?\d*)/i,
            normalize: parseMoney,
            confidence: 88,
          },
          {
            // Last resort: any rupee/INR amount over 1000 near a total keyword
            regex: /(?:total|payable|bill)(?:[^\n]{0,30})(?:rs\.?|inr|₹)\s*([\d,]{4,})/i,
            normalize: parseMoney,
            confidence: 72,
          },
        ]),
        null
      ),
    },
    authorization: {
      patient_signature: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Strict: explicit signature label for patient
            regex:
              /(?:signature\s*(?:of|of\s*the)?\s*(?:patient|insured|claimant)|(?:patient|insured|claimant)\s*(?:['s]\s*)?signature)/i,
            normalize: () => true,
            confidence: 65,
          },
          {
            // Lenient: any "signature" label present on the form (scanned forms may not repeat the word per-section)
            regex: /\bsignature\b/i,
            normalize: () => true,
            confidence: 45,
          },
        ]),
        null
      ),
      doctor_signature: makeTrace(
        findCandidate(pages, classifications, [
          {
            // Strict: explicit signature label for doctor/physician
            regex:
              /(?:signature\s*(?:of|of\s*the)?\s*(?:doctor|physician|surgeon|attending|medical\s*officer)|(?:doctor|physician|surgeon|attending)\s*(?:['s]\s*)?signature)/i,
            normalize: () => true,
            confidence: 65,
          },
          {
            // Lenient: Doctor/Physician present with any signature mention on page
            regex: /(?:dr\.?|doctor|physician|surgeon)(?:[\s\S]{0,120})signature/i,
            normalize: () => true,
            confidence: 42,
          },
        ]),
        null
      ),
      hospital_seal: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex: /(?:hospital\s*seal|official\s*seal|stamp|round\s*seal)/i,
            normalize: () => true,
            confidence: 60,
          },
        ]),
        null
      ),
      approval_stamp: makeTrace(
        findCandidate(pages, classifications, [
          {
            regex: /(?:approved\s*by|approval\s*signature|tpa\s*approval)/i,
            normalize: () => true,
            confidence: 60,
          },
        ]),
        null
      ),
    },
  };

  if (pythonResult) { // MODIFIED
    const mapPythonField = <T>(value: T, confidenceKey: string, rawValue: string): TraceableField<T> => { // MODIFIED
      let conf = pythonResult.confidence && typeof pythonResult.confidence[confidenceKey] === 'number' // MODIFIED
        ? pythonResult.confidence[confidenceKey] // MODIFIED
        : 85; // MODIFIED
      if (conf <= 1.0) {
        conf = Math.round(conf * 100);
      } else {
        conf = Math.round(conf);
      }
      conf = Math.max(0, Math.min(100, conf));
      return { // MODIFIED
        value, // MODIFIED
        confidence: conf, // MODIFIED
        page: 1, // MODIFIED
        docType: 'preauth', // MODIFIED
        method: 'ocr', // MODIFIED
        raw: rawValue || (value !== null && value !== undefined ? String(value) : null), // MODIFIED
      }; // MODIFIED
    }; // MODIFIED

    if (pythonResult.patient_name !== undefined && pythonResult.patient_name !== '') { // MODIFIED
      extracted.patient.full_name = mapPythonField(pythonResult.patient_name || null, 'patient_name', pythonResult.patient_name); // MODIFIED
    } // MODIFIED
    if (pythonResult.date_of_birth !== undefined && pythonResult.date_of_birth !== '') { // MODIFIED
      extracted.patient.dob = mapPythonField(pythonResult.date_of_birth || null, 'date_of_birth', pythonResult.date_of_birth); // MODIFIED
    } // MODIFIED
    if (pythonResult.patient_age !== undefined && pythonResult.patient_age !== null && pythonResult.patient_age !== '') {
      const ageVal = parseInt(String(pythonResult.patient_age).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(ageVal)) {
        extracted.patient.age = mapPythonField(ageVal, 'patient_age', String(pythonResult.patient_age));
      }
    }
    if (pythonResult.gender !== undefined && pythonResult.gender !== null && pythonResult.gender !== '') {
      extracted.patient.gender = mapPythonField(pythonResult.gender || null, 'gender', pythonResult.gender);
    }
    if (pythonResult.policy_number !== undefined && pythonResult.policy_number !== '') { // MODIFIED
      extracted.insurance.policy_number = mapPythonField(pythonResult.policy_number || null, 'policy_number', pythonResult.policy_number); // MODIFIED
    } // MODIFIED
    if (pythonResult.customer_id !== undefined && pythonResult.customer_id !== '') { // MODIFIED
      extracted.insurance.member_id = mapPythonField(pythonResult.customer_id || null, 'customer_id', pythonResult.customer_id); // MODIFIED
    } // MODIFIED
    if (pythonResult.tpa_name !== undefined && pythonResult.tpa_name !== null && pythonResult.tpa_name !== '') {
      extracted.insurance.tpa_name = mapPythonField(pythonResult.tpa_name || null, 'tpa_name', pythonResult.tpa_name);
    }
    if (pythonResult.tpa_id_number !== undefined && pythonResult.tpa_id_number !== null && pythonResult.tpa_id_number !== '') {
      extracted.insurance.member_id = mapPythonField(pythonResult.tpa_id_number || null, 'tpa_id_number', pythonResult.tpa_id_number);
    }
    if (pythonResult.hospital_name !== undefined && pythonResult.hospital_name !== '') { // MODIFIED
      extracted.hospital.facility_name = mapPythonField(pythonResult.hospital_name || null, 'hospital_name', pythonResult.hospital_name); // MODIFIED
    } // MODIFIED
    if (pythonResult.treating_doctor !== undefined && pythonResult.treating_doctor !== '') { // MODIFIED
      extracted.hospital.doctor_name = mapPythonField(pythonResult.treating_doctor || null, 'treating_doctor', pythonResult.treating_doctor); // MODIFIED
    } // MODIFIED
    if (pythonResult.admission_date !== undefined && pythonResult.admission_date !== '') { // MODIFIED
      extracted.hospital.admission_date = mapPythonField(pythonResult.admission_date || null, 'admission_date', pythonResult.admission_date); // MODIFIED
    } // MODIFIED
    if (pythonResult.discharge_date !== undefined && pythonResult.discharge_date !== '') { // MODIFIED
      extracted.hospital.discharge_date = mapPythonField(pythonResult.discharge_date || null, 'discharge_date', pythonResult.discharge_date); // MODIFIED
    } // MODIFIED
    if (pythonResult.diagnosis_code !== undefined && pythonResult.diagnosis_code !== '') { // MODIFIED
      extracted.clinical.diagnosis = mapPythonField(pythonResult.diagnosis_code || null, 'diagnosis_code', pythonResult.diagnosis_code); // MODIFIED
      if (pythonResult.diagnosis_code) { // MODIFIED
        const icdList = [pythonResult.diagnosis_code].filter((code: string) => /^[A-Z][0-9]/i.test(code)); // MODIFIED
        if (icdList.length > 0) { // MODIFIED
          extracted.clinical.icd10_codes = mapPythonField(icdList, 'diagnosis_code', pythonResult.diagnosis_code); // MODIFIED
        } // MODIFIED
      } // MODIFIED
    } // MODIFIED
    if (pythonResult.provisional_diagnosis !== undefined && pythonResult.provisional_diagnosis !== null && pythonResult.provisional_diagnosis !== '') {
      extracted.clinical.diagnosis = mapPythonField(pythonResult.provisional_diagnosis || null, 'provisional_diagnosis', pythonResult.provisional_diagnosis);
    }
    if (pythonResult.procedure_code !== undefined && pythonResult.procedure_code !== '') { // MODIFIED
      extracted.clinical.procedure = mapPythonField(pythonResult.procedure_code || null, 'procedure_code', pythonResult.procedure_code); // MODIFIED
    } // MODIFIED
    if (pythonResult.claim_amount !== undefined && pythonResult.claim_amount !== '') { // MODIFIED
      const claimVal = pythonResult.claim_amount ? parseInt(pythonResult.claim_amount.replace(/[^0-9]/g, ''), 10) : null; // MODIFIED
      if (claimVal !== null && !isNaN(claimVal)) { // MODIFIED
        extracted.financial.total_claimed = mapPythonField(claimVal, 'claim_amount', pythonResult.claim_amount); // MODIFIED
        extracted.financial.final_bill = mapPythonField(claimVal, 'claim_amount', pythonResult.claim_amount); // MODIFIED
      } // MODIFIED
    } // MODIFIED
    if (pythonResult.total_expected_cost !== undefined && pythonResult.total_expected_cost !== null && pythonResult.total_expected_cost !== '') {
      const costVal = parseFloat(String(pythonResult.total_expected_cost).replace(/[^0-9.]/g, ''));
      if (!isNaN(costVal)) {
        const evidence = pythonResult.total_expected_cost_evidence || String(pythonResult.total_expected_cost);
        extracted.financial.total_claimed = mapPythonField(costVal, 'total_expected_cost', evidence);
        extracted.financial.final_bill = mapPythonField(costVal, 'total_expected_cost', evidence);
      }
    }
  } // MODIFIED

  logger.info('EXTRACTION', 'Entity extraction completed');
  return extracted;
}
