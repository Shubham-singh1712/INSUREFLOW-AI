import { NextResponse } from 'next/server';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import { inflateSync } from 'zlib';

export const runtime = 'nodejs';

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type Tone = 'success' | 'warning' | 'danger' | 'info';

type ClaimField = {
  id:
    | 'patientName'
    | 'insuranceNumber'
    | 'diagnosis'
    | 'doctorName'
    | 'hospital'
    | 'procedure'
    | 'invoiceTotal'
    | 'claimType';
  label: string;
  value: string;
  confidence: number;
  source: string;
  sourcePage?: number | null;
  sourceDocType?: string;
  method?: string;
};

type TraceableField<T = string | number | boolean | string[] | null> = {
  value: T;
  confidence: number;
  source_page: number | null;
  source_doc_type: string;
  method: string;
};

type ValidationIssue = {
  id: string;
  severity: Severity;
  confidence: number;
  title: string;
  reference: string;
  fix: string;
  evidence?: string;
};

type DocumentGroup = {
  id: string;
  title: string;
  pages: string;
  confidence: number;
  status: string;
  summary: string;
  tone: Tone;
};

type ValidationMetric = {
  id: string;
  label: string;
  value: string;
  unit: string;
  color: string;
  helper: string;
};

type ValidationReport = {
  documentGroups: DocumentGroup[];
  metrics: ValidationMetric[];
  issues: ValidationIssue[];
  timeline: Array<{ id: string; label: string; time: string; done: boolean }>;
  pdfStructure: string[];
  summary: string;
  readinessScore: number;
  healthScore: number;
  ocrConfidence: number;
  source: 'ai' | 'local_analysis';
  extractionMethod: 'pdf_text' | 'ocr_required' | 'ai_ocr';
};

type ClaimAudit = {
  document_metadata: {
    document_type: string;
    page_count: number;
    scan_quality: 'Excellent' | 'Legible' | 'Poor/Blurry';
  };
  extracted_data: {
    patient: {
      full_name: TraceableField<string | null>;
      dob: TraceableField<string | null>;
      gender: TraceableField<string | null>;
      contact_number: TraceableField<string | null>;
    };
    insurance: {
      tpa_or_provider_name: TraceableField<string | null>;
      policy_number: TraceableField<string | null>;
      corporate_or_group_id: TraceableField<string | null>;
      member_id: TraceableField<string | null>;
    };
    hospital: {
      facility_name: TraceableField<string | null>;
      treating_doctor: TraceableField<string | null>;
      hospital_registration_no: TraceableField<string | null>;
    };
    clinical: {
      admission_date: TraceableField<string | null>;
      is_emergency: TraceableField<boolean | null>;
      presenting_complaints: TraceableField<string | null>;
      diagnosis: TraceableField<string | null>;
      icd_10_codes: TraceableField<string[]>;
      proposed_treatment: TraceableField<string | null>;
    };
    financial: {
      expected_total_cost: TraceableField<number | null>;
      room_rent: TraceableField<number | null>;
      icu_charges: TraceableField<number | null>;
      ot_charges: TraceableField<number | null>;
      professional_fees: TraceableField<number | null>;
    };
    signatures: {
      patient_signature_present: TraceableField<boolean>;
      doctor_signature_present: TraceableField<boolean>;
      hospital_seal_present: TraceableField<boolean>;
    };
  };
  validation_errors: string[];
};

const MAX_PROMPT_CHARS = 24000;
const emptyValue = 'Not found';

const fieldDefinitions: Array<
  Omit<ClaimField, 'value' | 'confidence' | 'source'> & { patterns: RegExp[] }
> = [
  {
    id: 'patientName',
    label: 'Patient name',
    patterns: [
      /(?:patient\s*(?:name)?|name)\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
      /(?:insured|beneficiary)\s*(?:name)?\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
    ],
  },
  {
    id: 'insuranceNumber',
    label: 'Insurance number',
    patterns: [
      /(?:member|policy|insurance|subscriber)\s*(?:id|no|number|#)?\s*[-:#]\s*([A-Z0-9][A-Z0-9/-]{5,})/i,
      /\b((?:MEM|POL|INS|ID)[-\s][A-Z0-9-]{6,})\b/i,
    ],
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis',
    patterns: [
      /(?:principal\s*)?diagnosis(?:\s*code)?\s*[:-]\s*([^\n\r]{3,120})/i,
      /\b([A-Z]\d{2}(?:\.\d+)?)\s*[-:]\s*([^\n\r]{3,90})/i,
    ],
  },
  {
    id: 'doctorName',
    label: 'Attending physician',
    patterns: [
      /(?:attending\s*)?(?:physician|doctor|consultant)\s*[:-]\s*(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/i,
      /\b(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/i,
    ],
  },
  {
    id: 'hospital',
    label: 'Hospital / Facility',
    patterns: [
      /(?:hospital|facility|provider)\s*(?:name)?\s*[:-]\s*([^\n\r]{3,120})/i,
      /([A-Z][A-Za-z&.' -]+(?:Hospital|Medical Center|Clinic|Healthcare)[^\n\r]{0,80})/i,
    ],
  },
  {
    id: 'procedure',
    label: 'Procedure',
    patterns: [
      /(?:procedure|service|treatment)\s*(?:code|description)?\s*[:-]\s*([^\n\r]{3,140})/i,
      /\b(CPT|HCPCS)\s*[:-]?\s*(\d{4,5})\b/i,
    ],
  },
  {
    id: 'invoiceTotal',
    label: 'Invoice total',
    patterns: [
      /(?:total\s*(?:billed|bill|invoice|claim|amount|charges?)|grand\s*total|net\s*amount)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
      /(?:INR|Rs\.?|\$)\s*([0-9,]+(?:\.\d{1,2})?)\s*(?:total|billed|amount)?/i,
    ],
  },
  {
    id: 'claimType',
    label: 'Claim metadata',
    patterns: [
      /(?:claim\s*type|type\s*of\s*claim)\s*[:-]\s*([^\n\r]{3,100})/i,
      /\b(cashless|reimbursement|inpatient|outpatient|pre[-\s]?authorization)\b/i,
    ],
  },
];

const cleanText = (value = '') =>
  value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const decodePdfHexText = (hex: string) => {
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return '';
  }
};

const decodePdfLiteralText = (value: string) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

const extractTextFromPdfBufferFallback = (buffer: Buffer) => {
  const pdf = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const textChunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(pdf))) {
    const rawStream = Buffer.from(match[1], 'latin1');
    let streamText = '';

    try {
      streamText = inflateSync(rawStream).toString('latin1');
    } catch {
      streamText = rawStream.toString('latin1');
    }

    for (const hexMatch of streamText.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const decoded = decodePdfHexText(hexMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }

    for (const literalMatch of streamText.matchAll(/\(([^()]*)\)\s*T[Jj]/g)) {
      const decoded = decodePdfLiteralText(literalMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }
  }

  return {
    text: cleanText(textChunks.join(' ')),
    pageCount: Math.max(1, (pdf.match(/\/Type\s*\/Page\b/g) || []).length),
  };
};

const extractTextFromPdfBuffer = async (buffer: Buffer) => {
  try {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    const text = cleanText(parsed.text || '');
    return {
      text,
      pageCount: Math.max(1, parsed.numpages || 1),
    };
  } catch {
    return extractTextFromPdfBufferFallback(buffer);
  }
};

const cleanValue = (value = '') =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/[|]+$/g, '')
    .trim();

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const hasExtractedValue = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  !(typeof value === 'string' && (value.trim().length === 0 || value.trim() === emptyValue)) &&
  !(Array.isArray(value) && value.length === 0);

const traceValue = <T,>(field: TraceableField<T> | T): T =>
  field && typeof field === 'object' && 'value' in (field as Record<string, unknown>)
    ? (field as TraceableField<T>).value
    : (field as T);

const traceConfidence = (value: unknown, fallback: number, supplied?: unknown) => {
  if (!hasExtractedValue(value)) return 0;
  const numeric = typeof supplied === 'number' ? supplied : Number(supplied);
  if (Number.isFinite(numeric) && numeric > 0) return clamp(numeric, 1, 99);
  return clamp(fallback, 40, 99);
};

const sourcePageForValue = (text: string, pages: number, value: unknown) => {
  if (!hasExtractedValue(value) || pages <= 0) return null;
  const searchable = Array.isArray(value) ? String(value[0] || '') : String(value);
  if (!searchable.trim()) return null;
  const index = text.toLowerCase().indexOf(searchable.toLowerCase());
  if (index < 0 || text.length === 0) return 1;
  return clamp(Math.floor((index / text.length) * pages) + 1, 1, Math.max(1, pages));
};

const makeTrace = <T extends string | number | boolean | string[] | null>({
  value,
  fallbackConfidence,
  text,
  pages,
  sourceDocType,
  method,
  confidence,
  sourcePage,
}: {
  value: T;
  fallbackConfidence: number;
  text: string;
  pages: number;
  sourceDocType: string;
  method: string;
  confidence?: unknown;
  sourcePage?: number | null;
}): TraceableField<T> => ({
  value,
  confidence: traceConfidence(value, fallbackConfidence, confidence),
  source_page: hasExtractedValue(value) ? sourcePage ?? sourcePageForValue(text, pages, value) : null,
  source_doc_type: sourceDocType,
  method,
});

const moneyToNumber = (value = '') => {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: string) => {
  const amount = moneyToNumber(value);
  return amount > 0 ? `INR ${Math.round(amount).toLocaleString('en-IN')}` : emptyValue;
};

const findFirst = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanValue([match?.[1], match?.[2]].filter(Boolean).join(' - '));
    if (value) return value;
  }
  return '';
};

const hasAny = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

const extractDates = (text: string) =>
  [...text.matchAll(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)].map(
    (match) => match[0]
  );

const findDateByLabel = (text: string, label: string) =>
  cleanValue(
    text.match(
      new RegExp(
        `${label}\\s*[:\\-]?\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`,
        'i'
      )
    )?.[1] || ''
  );

const normalizeDate = (value: string) => {
  if (!value) return '';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const parts = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!parts) return value;
  const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
  return `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
};

const extractLineItemAmounts = (text: string) =>
  [...text.matchAll(/(?:INR|Rs\.?|\$)?\s*([0-9][0-9,]{2,}(?:\.\d{1,2})?)/gi)]
    .map((match) => moneyToNumber(match[1]))
    .filter((amount) => amount > 0);

const nullable = (value = '') => {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : null;
};

const findAuditValue = (text: string, patterns: RegExp[]) => nullable(findFirst(text, patterns));

const findAuditDate = (text: string, label: string) => {
  const value = findDateByLabel(text, label);
  return value ? normalizeDate(value) : null;
};

const findAuditAmount = (text: string, patterns: RegExp[]) => {
  const value = findFirst(text, patterns);
  const amount = moneyToNumber(value);
  return amount > 0 ? amount : null;
};

const uniqueMatches = (text: string, pattern: RegExp) =>
  Array.from(new Set([...text.matchAll(pattern)].map((match) => cleanValue(match[1])))).filter(
    Boolean
  );

const inferDocumentType = (text: string) => {
  if (hasAny(text, [/pre[-\s]?authorization/i, /pre[-\s]?auth/i, /cashless\s+request/i])) {
    return 'Pre-Authorization Request';
  }
  if (hasAny(text, [/discharge\s+summary/i])) return 'Discharge Summary';
  if (hasAny(text, [/UB[-\s]?04/i, /CMS[-\s]?1450/i])) return 'UB-04 / CMS-1450';
  if (hasAny(text, [/claim\s+form/i])) return 'Medical Claim Form';
  if (hasAny(text, [/invoice/i, /itemized\s+bill/i])) return 'Hospital Invoice';
  return 'Medical Claim Document';
};

const scanQualityFromConfidence = (
  ocrConfidence: number
): ClaimAudit['document_metadata']['scan_quality'] => {
  if (ocrConfidence >= 85) return 'Excellent';
  if (ocrConfidence >= 58) return 'Legible';
  return 'Poor/Blurry';
};

const hasSignatureNear = (text: string, rolePattern: string) =>
  new RegExp(`${rolePattern}[\\s\\S]{0,80}(signature|signed|e[-\\s]?signed)`, 'i').test(text) ||
  new RegExp(`(signature|signed|e[-\\s]?signed)[\\s\\S]{0,80}${rolePattern}`, 'i').test(text);

const buildClaimAudit = ({
  text,
  pages,
  ocrConfidence,
  fields,
  extractionMethod = 'pdf_text',
}: {
  text: string;
  pages: number;
  ocrConfidence: number;
  fields: ClaimField[];
  extractionMethod?: ValidationReport['extractionMethod'];
}): ClaimAudit => {
  const method = extractionMethod === 'ai_ocr' ? 'ocr' : 'pdf_text';
  const directConfidence = (value: unknown) =>
    hasExtractedValue(value) ? clamp(ocrConfidence + 8, 90, 99) : 0;
  const regexConfidence = (value: unknown) =>
    hasExtractedValue(value) ? clamp(ocrConfidence + 4, 80, 95) : 0;
  const weakConfidence = (value: unknown) =>
    hasExtractedValue(value) ? clamp(ocrConfidence - 8, 40, 70) : 0;

  const patientName = findAuditValue(text, [
    /(?:patient\s*(?:name)?|name\s+of\s+patient)\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
    /(?:insured|beneficiary)\s*(?:name)?\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
  ]);
  const dob = findAuditDate(text, '(?:DOB|Date\\s+of\\s+Birth|Birth\\s+Date)');
  const gender = findAuditValue(text, [
    /(?:gender|sex)\s*[:-]\s*(male|female|m|f|other|transgender)/i,
  ]);
  const contactNumber = findAuditValue(text, [
    /(?:contact|phone|mobile|telephone)(?:\s*(?:no|number))?\s*[:-]\s*(\+?\d[\d\s().-]{7,})/i,
  ]);
  const providerName = findAuditValue(text, [
    /(?:TPA|payer|insurer|insurance\s*(?:provider|company|name))\s*[:-]\s*([^\n\r]{3,120})/i,
  ]);
  const policyNumber = findAuditValue(text, [
    /policy\s*(?:no|number|id|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{5,})/i,
  ]);
  const groupId = findAuditValue(text, [
    /(?:corporate|group)\s*(?:id|no|number|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{2,})/i,
  ]);
  const memberId = findAuditValue(text, [
    /(?:member|subscriber|card|health\s*card)\s*(?:id|no|number|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{5,})/i,
  ]);
  const facilityName = findAuditValue(text, [
    /(?:hospital|facility|provider)\s*(?:name)?\s*[:-]\s*([^\n\r]{3,120})/i,
    /([A-Z][A-Za-z&.' -]+(?:Hospital|Medical Center|Clinic|Healthcare)[^\n\r]{0,80})/i,
  ]);
  const treatingDoctor = findAuditValue(text, [
    /(?:treating|attending|consulting)?\s*(?:doctor|physician|consultant)\s*[:-]\s*(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/i,
    /\b(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/i,
  ]);
  const hospitalRegistrationNo = findAuditValue(text, [
    /(?:hospital\s*)?(?:registration|reg\.?)\s*(?:no|number|#)?\s*[:-]\s*([A-Z0-9/-]{4,})/i,
    /(?:TMC|MCI|NMC)\s*(?:reg\.?|registration)?\s*(?:no|number|#)?\s*[:-]\s*([A-Z0-9/-]{4,})/i,
  ]);
  const admissionDate = findAuditDate(text, 'Admission\\s+Date|Admitted|Expected\\s+Admission');
  const isEmergency = hasAny(text, [/emergency\s*[:-]\s*(yes|true)/i, /\bemergency\b/i])
    ? true
    : hasAny(text, [/emergency\s*[:-]\s*(no|false)/i, /planned|elective/i])
      ? false
      : null;
  const presentingComplaints = findAuditValue(text, [
    /(?:presenting\s+complaints?|chief\s+complaints?|complaints?)\s*[:-]\s*([^\n\r]{3,240})/i,
  ]);
  const diagnosis =
    findAuditValue(text, [/(?:principal\s*)?diagnosis(?:\s*code)?\s*[:-]\s*([^\n\r]{3,160})/i]) ||
    fields.find((field) => field.id === 'diagnosis' && field.value !== emptyValue)?.value ||
    null;
  const icd10Codes = uniqueMatches(text, /\b([A-Z]\d{2}(?:\.\d+)?)\b/g);
  const proposedTreatment =
    findAuditValue(text, [
      /(?:proposed\s+treatment|planned\s+procedure|procedure|treatment)\s*[:-]\s*([^\n\r]{3,180})/i,
    ]) ||
    fields.find((field) => field.id === 'procedure' && field.value !== emptyValue)?.value ||
    null;
  const financial = {
    expected_total_cost: findAuditAmount(text, [
      /(?:expected|estimated|total)\s*(?:total\s*)?(?:cost|amount|expense|package)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
      /(?:total\s*(?:billed|bill|invoice|claim|amount|charges?)|grand\s*total|net\s*amount)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ]),
    room_rent: findAuditAmount(text, [
      /(?:room\s*rent|room\s*charges?)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ]),
    icu_charges: findAuditAmount(text, [
      /(?:ICU|intensive\s+care)\s*(?:charges?|rent)?\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ]),
    ot_charges: findAuditAmount(text, [
      /(?:OT|operation\s*theatre|operating\s*room)\s*(?:charges?)?\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ]),
    professional_fees: findAuditAmount(text, [
      /(?:professional|doctor|surgeon|consultation)\s*(?:fees?|charges?)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ]),
  };
  const signatures = {
    patient_signature_present: hasSignatureNear(text, 'patient|insured|beneficiary'),
    doctor_signature_present: hasSignatureNear(text, 'doctor|physician|consultant|treating'),
    hospital_seal_present: hasAny(text, [
      /hospital\s+seal/i,
      /hospital\s+stamp/i,
      /official\s+seal/i,
    ]),
  };
  const audit: ClaimAudit = {
    document_metadata: {
      document_type: inferDocumentType(text),
      page_count: pages,
      scan_quality: scanQualityFromConfidence(ocrConfidence),
    },
    extracted_data: {
      patient: {
        full_name: makeTrace({
          value: patientName,
          fallbackConfidence: directConfidence(patientName),
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        dob: makeTrace({
          value: dob,
          fallbackConfidence: directConfidence(dob),
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        gender: makeTrace({
          value: gender,
          fallbackConfidence: regexConfidence(gender),
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        contact_number: makeTrace({
          value: contactNumber,
          fallbackConfidence: regexConfidence(contactNumber),
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
      },
      insurance: {
        tpa_or_provider_name: makeTrace({
          value: providerName,
          fallbackConfidence: regexConfidence(providerName),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        policy_number: makeTrace({
          value: policyNumber,
          fallbackConfidence: regexConfidence(policyNumber),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        corporate_or_group_id: makeTrace({
          value: groupId,
          fallbackConfidence: regexConfidence(groupId),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        member_id: makeTrace({
          value: memberId,
          fallbackConfidence: regexConfidence(memberId),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
      },
      hospital: {
        facility_name: makeTrace({
          value: facilityName,
          fallbackConfidence: directConfidence(facilityName),
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
        treating_doctor: makeTrace({
          value: treatingDoctor,
          fallbackConfidence: regexConfidence(treatingDoctor),
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
        hospital_registration_no: makeTrace({
          value: hospitalRegistrationNo,
          fallbackConfidence: regexConfidence(hospitalRegistrationNo),
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
      },
      clinical: {
        admission_date: makeTrace({
          value: admissionDate,
          fallbackConfidence: directConfidence(admissionDate),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        is_emergency: makeTrace({
          value: isEmergency,
          fallbackConfidence: isEmergency === null ? 0 : weakConfidence(isEmergency),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method: isEmergency === null ? method : 'inferred_weak_match',
        }),
        presenting_complaints: makeTrace({
          value: presentingComplaints,
          fallbackConfidence: regexConfidence(presentingComplaints),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        diagnosis: makeTrace({
          value: diagnosis,
          fallbackConfidence: diagnosis === patientName ? weakConfidence(diagnosis) : regexConfidence(diagnosis),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method: hasExtractedValue(diagnosis) && !text.toLowerCase().includes(String(diagnosis).toLowerCase())
            ? 'inferred_weak_match'
            : method,
        }),
        icd_10_codes: makeTrace({
          value: icd10Codes,
          fallbackConfidence: regexConfidence(icd10Codes),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        proposed_treatment: makeTrace({
          value: proposedTreatment,
          fallbackConfidence: regexConfidence(proposedTreatment),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method: hasExtractedValue(proposedTreatment) && !text.toLowerCase().includes(String(proposedTreatment).toLowerCase())
            ? 'inferred_weak_match'
            : method,
        }),
      },
      financial: {
        expected_total_cost: makeTrace({
          value: financial.expected_total_cost,
          fallbackConfidence: directConfidence(financial.expected_total_cost),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        room_rent: makeTrace({
          value: financial.room_rent,
          fallbackConfidence: regexConfidence(financial.room_rent),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        icu_charges: makeTrace({
          value: financial.icu_charges,
          fallbackConfidence: regexConfidence(financial.icu_charges),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        ot_charges: makeTrace({
          value: financial.ot_charges,
          fallbackConfidence: regexConfidence(financial.ot_charges),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        professional_fees: makeTrace({
          value: financial.professional_fees,
          fallbackConfidence: regexConfidence(financial.professional_fees),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
      },
      signatures: {
        patient_signature_present: makeTrace({
          value: signatures.patient_signature_present,
          fallbackConfidence: signatures.patient_signature_present ? regexConfidence(true) : 0,
          text,
          pages,
          sourceDocType: 'Authorization form',
          method,
        }),
        doctor_signature_present: makeTrace({
          value: signatures.doctor_signature_present,
          fallbackConfidence: signatures.doctor_signature_present ? regexConfidence(true) : 0,
          text,
          pages,
          sourceDocType: 'Authorization form',
          method,
        }),
        hospital_seal_present: makeTrace({
          value: signatures.hospital_seal_present,
          fallbackConfidence: signatures.hospital_seal_present ? regexConfidence(true) : 0,
          text,
          pages,
          sourceDocType: 'Authorization form',
          method,
        }),
      },
    },
    validation_errors: [],
  };

  audit.validation_errors = buildAuditValidationErrors(audit, text);
  return audit;
};

const buildAuditValidationErrors = (audit: ClaimAudit, text: string) => {
  const errors: string[] = [];
  const { extracted_data: data } = audit;
  const addMissing = (value: unknown, message: string) => {
    const actualValue = value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)
      ? (value as TraceableField).value
      : value;
    if (
      actualValue === null ||
      actualValue === undefined ||
      (typeof actualValue === 'string' && actualValue.trim().length === 0) ||
      (Array.isArray(actualValue) && actualValue.length === 0)
    ) {
      errors.push(message);
    }
  };

  addMissing(data.patient.full_name, 'Missing patient full name.');
  addMissing(data.patient.dob, 'Missing patient date of birth.');
  addMissing(data.patient.gender, 'Missing patient gender.');
  addMissing(data.patient.contact_number, 'Missing patient contact number.');
  addMissing(data.insurance.tpa_or_provider_name, 'Missing insurance TPA or provider name.');
  addMissing(data.insurance.policy_number, 'Missing insurance policy number.');
  addMissing(data.insurance.corporate_or_group_id, 'Missing corporate or group ID.');
  addMissing(data.insurance.member_id, 'Missing member ID.');
  addMissing(data.hospital.facility_name, 'Missing hospital or facility name.');
  addMissing(data.hospital.treating_doctor, 'Missing treating doctor name.');
  addMissing(
    data.hospital.hospital_registration_no,
    'Missing hospital registration or TMC number.'
  );
  addMissing(data.clinical.admission_date, 'Missing admission date.');
  addMissing(data.clinical.presenting_complaints, 'Missing presenting complaints.');
  addMissing(data.clinical.diagnosis, 'Missing diagnosis.');
  addMissing(data.clinical.icd_10_codes, 'Missing ICD-10 codes for the stated diagnosis.');
  addMissing(data.clinical.proposed_treatment, 'Missing proposed treatment or procedure details.');
  addMissing(data.financial.expected_total_cost, 'Missing expected total cost.');

  const roomRent = traceValue(data.financial.room_rent);
  const icuCharges = traceValue(data.financial.icu_charges);
  const otCharges = traceValue(data.financial.ot_charges);
  const professionalFees = traceValue(data.financial.professional_fees);
  const expectedTotalCost = traceValue(data.financial.expected_total_cost);
  const admissionDate = traceValue(data.clinical.admission_date);
  const isEmergency = traceValue(data.clinical.is_emergency);

  if (roomRent === null && icuCharges === null && otCharges === null && professionalFees === null) {
    errors.push('Missing financial line-item breakdown.');
  }

  if (!hasAny(text, [/expected\s+stay/i, /length\s+of\s+stay/i, /\bLOS\b/i, /days?\s+stay/i])) {
    errors.push('Missing expected length of stay.');
  }

  if (!traceValue(data.signatures.patient_signature_present)) errors.push('Patient signature is missing.');
  if (!traceValue(data.signatures.doctor_signature_present)) errors.push('Doctor signature is missing.');
  if (!traceValue(data.signatures.hospital_seal_present)) errors.push('Hospital seal or stamp is missing.');

  const lineItemValues = [
    roomRent,
    icuCharges,
    otCharges,
    professionalFees,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (expectedTotalCost !== null && lineItemValues.length >= 2) {
    const lineSum = lineItemValues.reduce((sum, value) => sum + value, 0);
    if (
      Math.abs(lineSum - expectedTotalCost) >
      Math.max(10, expectedTotalCost * 0.02)
    ) {
      errors.push('Financial breakdown does not sum to expected total cost.');
    }
  }

  if (audit.document_metadata.scan_quality === 'Poor/Blurry') {
    errors.push('Scan quality is poor or blurry; extracted values may be incomplete or illegible.');
  }

  if (
    admissionDate &&
    isEmergency === false &&
    hasAny(text, [/planned/i, /future/i, /elective/i, /proposed/i])
  ) {
    const admission = new Date(admissionDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!Number.isNaN(admission.getTime()) && admission < today) {
      errors.push('Admission date is in the past for a planned or elective treatment request.');
    }
  }

  return Array.from(new Set(errors));
};

const traceFromUnknown = <T extends string | number | boolean | string[] | null>({
  raw,
  fallbackValue,
  fallbackConfidence,
  text,
  pages,
  sourceDocType,
  method,
}: {
  raw: unknown;
  fallbackValue: T;
  fallbackConfidence: number;
  text: string;
  pages: number;
  sourceDocType: string;
  method: string;
}): TraceableField<T> => {
  const maybeTrace =
    raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)
      ? (raw as Partial<TraceableField<T>>)
      : null;
  const value = (maybeTrace ? maybeTrace.value : raw) as T;
  const normalizedValue = (value === undefined ? fallbackValue : value) as T;

  return makeTrace({
    value: normalizedValue,
    fallbackConfidence,
    text,
    pages,
    sourceDocType: maybeTrace?.source_doc_type || sourceDocType,
    method: maybeTrace?.method || method,
    confidence: maybeTrace?.confidence,
    sourcePage: maybeTrace?.source_page ?? undefined,
  });
};

const normalizeClaimAudit = ({
  audit,
  fallbackAudit,
  fallbackFields,
  text,
  pages,
  extractionMethod,
}: {
  audit: unknown;
  fallbackAudit: ClaimAudit;
  fallbackFields: ClaimField[];
  text: string;
  pages: number;
  extractionMethod: ValidationReport['extractionMethod'];
}): ClaimAudit => {
  const rawAudit = audit && typeof audit === 'object' ? (audit as any) : {};
  const rawData = rawAudit.extracted_data || {};
  const fallbackData = fallbackAudit.extracted_data;
  const method = extractionMethod === 'ai_ocr' ? 'ocr' : 'pdf_text';
  const fallbackField = (id: ClaimField['id']) => fallbackFields.find((field) => field.id === id);
  const fieldConfidence = (id: ClaimField['id'], fallback = 82) =>
    clamp(fallbackField(id)?.confidence || fallback, 40, 99);

  const normalized: ClaimAudit = {
    document_metadata: {
      document_type: rawAudit.document_metadata?.document_type || fallbackAudit.document_metadata.document_type,
      page_count: Number.isFinite(rawAudit.document_metadata?.page_count)
        ? rawAudit.document_metadata.page_count
        : fallbackAudit.document_metadata.page_count,
      scan_quality:
        rawAudit.document_metadata?.scan_quality || fallbackAudit.document_metadata.scan_quality,
    },
    extracted_data: {
      patient: {
        full_name: traceFromUnknown({
          raw: rawData.patient?.full_name,
          fallbackValue: traceValue(fallbackData.patient.full_name),
          fallbackConfidence: fieldConfidence('patientName', traceValue(fallbackData.patient.full_name) ? fallbackData.patient.full_name.confidence : 90),
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        dob: traceFromUnknown({
          raw: rawData.patient?.dob,
          fallbackValue: traceValue(fallbackData.patient.dob),
          fallbackConfidence: fallbackData.patient.dob.confidence || 90,
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        gender: traceFromUnknown({
          raw: rawData.patient?.gender,
          fallbackValue: traceValue(fallbackData.patient.gender),
          fallbackConfidence: fallbackData.patient.gender.confidence || 82,
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
        contact_number: traceFromUnknown({
          raw: rawData.patient?.contact_number,
          fallbackValue: traceValue(fallbackData.patient.contact_number),
          fallbackConfidence: fallbackData.patient.contact_number.confidence || 82,
          text,
          pages,
          sourceDocType: 'Patient intake form',
          method,
        }),
      },
      insurance: {
        tpa_or_provider_name: traceFromUnknown({
          raw: rawData.insurance?.tpa_or_provider_name,
          fallbackValue: traceValue(fallbackData.insurance.tpa_or_provider_name),
          fallbackConfidence: fallbackData.insurance.tpa_or_provider_name.confidence || 82,
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        policy_number: traceFromUnknown({
          raw: rawData.insurance?.policy_number,
          fallbackValue: traceValue(fallbackData.insurance.policy_number),
          fallbackConfidence: fallbackData.insurance.policy_number.confidence || fieldConfidence('insuranceNumber'),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        corporate_or_group_id: traceFromUnknown({
          raw: rawData.insurance?.corporate_or_group_id,
          fallbackValue: traceValue(fallbackData.insurance.corporate_or_group_id),
          fallbackConfidence: fallbackData.insurance.corporate_or_group_id.confidence || 82,
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
        member_id: traceFromUnknown({
          raw: rawData.insurance?.member_id,
          fallbackValue: traceValue(fallbackData.insurance.member_id) || fallbackField('insuranceNumber')?.value || null,
          fallbackConfidence: fallbackData.insurance.member_id.confidence || fieldConfidence('insuranceNumber'),
          text,
          pages,
          sourceDocType: 'Insurance document',
          method,
        }),
      },
      hospital: {
        facility_name: traceFromUnknown({
          raw: rawData.hospital?.facility_name,
          fallbackValue: traceValue(fallbackData.hospital.facility_name) || fallbackField('hospital')?.value || null,
          fallbackConfidence: fallbackData.hospital.facility_name.confidence || fieldConfidence('hospital'),
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
        treating_doctor: traceFromUnknown({
          raw: rawData.hospital?.treating_doctor,
          fallbackValue: traceValue(fallbackData.hospital.treating_doctor) || fallbackField('doctorName')?.value || null,
          fallbackConfidence: fallbackData.hospital.treating_doctor.confidence || fieldConfidence('doctorName'),
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
        hospital_registration_no: traceFromUnknown({
          raw: rawData.hospital?.hospital_registration_no,
          fallbackValue: traceValue(fallbackData.hospital.hospital_registration_no),
          fallbackConfidence: fallbackData.hospital.hospital_registration_no.confidence || 82,
          text,
          pages,
          sourceDocType: 'Hospital records',
          method,
        }),
      },
      clinical: {
        admission_date: traceFromUnknown({
          raw: rawData.clinical?.admission_date,
          fallbackValue: traceValue(fallbackData.clinical.admission_date),
          fallbackConfidence: fallbackData.clinical.admission_date.confidence || 90,
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        is_emergency: traceFromUnknown({
          raw: rawData.clinical?.is_emergency,
          fallbackValue: traceValue(fallbackData.clinical.is_emergency),
          fallbackConfidence: fallbackData.clinical.is_emergency.confidence || 60,
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method: 'inferred_weak_match',
        }),
        presenting_complaints: traceFromUnknown({
          raw: rawData.clinical?.presenting_complaints,
          fallbackValue: traceValue(fallbackData.clinical.presenting_complaints),
          fallbackConfidence: fallbackData.clinical.presenting_complaints.confidence || 82,
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        diagnosis: traceFromUnknown({
          raw: rawData.clinical?.diagnosis,
          fallbackValue: traceValue(fallbackData.clinical.diagnosis) || fallbackField('diagnosis')?.value || null,
          fallbackConfidence: fallbackData.clinical.diagnosis.confidence || fieldConfidence('diagnosis'),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        icd_10_codes: traceFromUnknown({
          raw: rawData.clinical?.icd_10_codes,
          fallbackValue: traceValue(fallbackData.clinical.icd_10_codes),
          fallbackConfidence: fallbackData.clinical.icd_10_codes.confidence || 82,
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
        proposed_treatment: traceFromUnknown({
          raw: rawData.clinical?.proposed_treatment,
          fallbackValue: traceValue(fallbackData.clinical.proposed_treatment) || fallbackField('procedure')?.value || null,
          fallbackConfidence: fallbackData.clinical.proposed_treatment.confidence || fieldConfidence('procedure', 65),
          text,
          pages,
          sourceDocType: 'Clinical summary',
          method,
        }),
      },
      financial: {
        expected_total_cost: traceFromUnknown({
          raw: rawData.financial?.expected_total_cost,
          fallbackValue: traceValue(fallbackData.financial.expected_total_cost) || moneyToNumber(fallbackField('invoiceTotal')?.value || ''),
          fallbackConfidence: fallbackData.financial.expected_total_cost.confidence || fieldConfidence('invoiceTotal'),
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        room_rent: traceFromUnknown({
          raw: rawData.financial?.room_rent,
          fallbackValue: traceValue(fallbackData.financial.room_rent),
          fallbackConfidence: fallbackData.financial.room_rent.confidence || 82,
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        icu_charges: traceFromUnknown({
          raw: rawData.financial?.icu_charges,
          fallbackValue: traceValue(fallbackData.financial.icu_charges),
          fallbackConfidence: fallbackData.financial.icu_charges.confidence || 82,
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        ot_charges: traceFromUnknown({
          raw: rawData.financial?.ot_charges,
          fallbackValue: traceValue(fallbackData.financial.ot_charges),
          fallbackConfidence: fallbackData.financial.ot_charges.confidence || 82,
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
        professional_fees: traceFromUnknown({
          raw: rawData.financial?.professional_fees,
          fallbackValue: traceValue(fallbackData.financial.professional_fees),
          fallbackConfidence: fallbackData.financial.professional_fees.confidence || 82,
          text,
          pages,
          sourceDocType: 'Itemized bill',
          method,
        }),
      },
      signatures: fallbackData.signatures,
    },
    validation_errors: Array.isArray(rawAudit.validation_errors)
      ? rawAudit.validation_errors
      : fallbackAudit.validation_errors,
  };

  normalized.validation_errors = buildAuditValidationErrors(normalized, text);
  return normalized;
};

const sourceLabel = (field: TraceableField) =>
  `${field.source_doc_type} - ${field.method}${field.source_page ? ` - page ${field.source_page}` : ''}`;

const claimFieldFromTrace = (
  id: ClaimField['id'],
  label: string,
  field: TraceableField,
  fallbackValue = ''
): ClaimField => {
  const value = traceValue(field);
  const cleanFallbackValue = fallbackValue === emptyValue ? '' : fallbackValue;
  const displayValue = hasExtractedValue(value)
    ? Array.isArray(value)
      ? value.join(', ')
      : String(value)
    : cleanFallbackValue;

  return {
    id,
    label,
    value: displayValue || '',
    confidence: displayValue ? field.confidence : 0,
    source: displayValue ? sourceLabel(field) : 'No source page extracted',
    sourcePage: displayValue ? field.source_page : null,
    sourceDocType: field.source_doc_type,
    method: field.method,
  };
};

const buildClaimFieldsFromAudit = (
  audit: ClaimAudit,
  fallbackFields: ClaimField[]
): ClaimField[] => {
  const fallback = (id: ClaimField['id']) => fallbackFields.find((field) => field.id === id);
  const procedureFallback = traceValue(audit.extracted_data.clinical.proposed_treatment);
  const claimTypeValue = [
    traceValue(audit.extracted_data.clinical.admission_date) && 'Inpatient',
    traceValue(audit.extracted_data.clinical.proposed_treatment) && 'procedural',
    'claim',
  ].filter(Boolean).join(' ');

  return [
    claimFieldFromTrace('patientName', 'Patient name', audit.extracted_data.patient.full_name, fallback('patientName')?.value),
    claimFieldFromTrace('insuranceNumber', 'Insurance number', audit.extracted_data.insurance.member_id, fallback('insuranceNumber')?.value),
    claimFieldFromTrace('diagnosis', 'Diagnosis', audit.extracted_data.clinical.diagnosis, fallback('diagnosis')?.value),
    claimFieldFromTrace('doctorName', 'Attending physician', audit.extracted_data.hospital.treating_doctor, fallback('doctorName')?.value),
    claimFieldFromTrace('hospital', 'Hospital / Facility', audit.extracted_data.hospital.facility_name, fallback('hospital')?.value),
    claimFieldFromTrace('procedure', 'Procedure', audit.extracted_data.clinical.proposed_treatment, procedureFallback ? String(procedureFallback) : fallback('procedure')?.value),
    claimFieldFromTrace('invoiceTotal', 'Invoice total', audit.extracted_data.financial.expected_total_cost, fallback('invoiceTotal')?.value),
    {
      id: 'claimType',
      label: 'Claim metadata',
      value: claimTypeValue,
      confidence: claimTypeValue ? clamp(audit.extracted_data.clinical.admission_date.confidence || 72, 40, 95) : 0,
      source: claimTypeValue ? 'Claim packet context - inferred_weak_match' : 'No source page extracted',
      sourcePage: null,
      sourceDocType: 'Claim packet context',
      method: 'inferred_weak_match',
    },
  ];
};

const inferDocumentGroups = (
  text: string,
  pages: number,
  ocrConfidence: number
): DocumentGroup[] => {
  const groups: DocumentGroup[] = [];
  const sectionSignals = [
    {
      id: 'insurance-card',
      title: 'Insurance Card',
      patterns: [/member\s*id/i, /policy/i, /payer/i, /insurance/i],
      success: 'Member or policy identifiers found.',
      missing: 'No strong insurance card identifiers found.',
    },
    {
      id: 'discharge-summary',
      title: 'Discharge Summary',
      patterns: [/discharge/i, /admission/i, /diagnosis/i, /attending\s*physician/i],
      success: 'Clinical dates, diagnosis, or attending physician content found.',
      missing: 'No discharge summary markers found.',
    },
    {
      id: 'invoice',
      title: 'Hospital Invoice',
      patterns: [/invoice/i, /bill/i, /total\s*(?:billed|amount|charges?)/i, /line\s*item/i],
      success: 'Billing totals or invoice language found.',
      missing: 'No invoice or billing total markers found.',
    },
    {
      id: 'authorization',
      title: 'Pre-Authorization / Forms',
      patterns: [/pre[-\s]?auth/i, /authorization/i, /approval/i, /claim\s*form/i],
      success: 'Authorization or claim form language found.',
      missing: 'No authorization or claim form markers found.',
    },
  ];

  for (const signal of sectionSignals) {
    const found = hasAny(text, signal.patterns);
    groups.push({
      id: signal.id,
      title: signal.title,
      pages: pages > 1 ? `Packet pages ${found ? 'detected' : 'not isolated'}` : 'Page 1',
      confidence: found ? clamp(ocrConfidence + 3, 55, 99) : clamp(ocrConfidence - 24, 15, 76),
      status: found ? 'Detected' : 'Missing or unclear',
      summary: found ? signal.success : signal.missing,
      tone: found ? 'success' : 'warning',
    });
  }

  return groups;
};

const buildLocalExtraction = (text: string, pages: number, filename: string) => {
  const dates = extractDates(text);
  const dob = normalizeDate(findDateByLabel(text, '(?:DOB|Date\\s+of\\s+Birth|Birth\\s+Date)'));
  const admissionDate = normalizeDate(findDateByLabel(text, 'Admission\\s+Date|Admitted'));
  const dischargeDate = normalizeDate(findDateByLabel(text, 'Discharge\\s+Date|Discharged'));
  const rawFields = Object.fromEntries(
    fieldDefinitions.map((definition) => [definition.id, findFirst(text, definition.patterns)])
  ) as Record<ClaimField['id'], string>;

  if (!rawFields.claimType) {
    rawFields.claimType = [
      hasAny(text, [/cashless/i]) && 'Cashless',
      hasAny(text, [/reimbursement/i]) && 'Reimbursement',
      hasAny(text, [/inpatient|admission|discharge/i]) && 'inpatient',
      'claim',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const textDensity = pages > 0 ? text.length / pages : text.length;
  const ocrConfidence = clamp(
    35 +
      Math.min(38, textDensity / 55) +
      Object.values(rawFields).filter(Boolean).length * 4 -
      (text.length < 250 ? 24 : 0)
  );

  const fields: ClaimField[] = fieldDefinitions.map((definition) => {
    const rawValue = rawFields[definition.id];
    const confidence = rawValue
      ? clamp(ocrConfidence + (definition.id === 'invoiceTotal' ? -4 : 7))
      : clamp(ocrConfidence - 34, 0, 72);

    return {
      id: definition.id,
      label: definition.label,
      value: definition.id === 'invoiceTotal' ? formatMoney(rawValue) : rawValue || emptyValue,
      confidence,
      source: rawValue
        ? `${filename} - PDF text extraction`
        : `${filename} - not found in extracted text`,
    };
  });

  return {
    fields,
    facts: {
      dob,
      admissionDate,
      dischargeDate,
      dates,
      pageCount: pages,
      lineItemAmounts: extractLineItemAmounts(text),
      hasSignature: hasAny(text, [
        /signature/i,
        /signed\s+by/i,
        /e[-\s]?signed/i,
        /authorized\s+signature/i,
      ]),
      hasDiagnosis: Boolean(rawFields.diagnosis),
      hasInsuranceId: Boolean(rawFields.insuranceNumber),
      hasInvoice: Boolean(rawFields.invoiceTotal),
      hasDob: Boolean(dob),
      hasDoctor: Boolean(rawFields.doctorName),
    },
    ocrConfidence,
  };
};

const buildLocalIssues = (
  text: string,
  fields: ClaimField[],
  facts: ReturnType<typeof buildLocalExtraction>['facts'],
  ocrConfidence: number
) => {
  const issues: ValidationIssue[] = [];
  const getField = (id: ClaimField['id']) => fields.find((field) => field.id === id);
  const insurance = getField('insuranceNumber')?.value || '';
  const invoiceTotal = moneyToNumber(getField('invoiceTotal')?.value || '');
  const lineAmounts = facts.lineItemAmounts.filter((amount) => amount !== invoiceTotal);
  const candidateLineSum =
    lineAmounts.length >= 2 ? lineAmounts.reduce((sum, amount) => sum + amount, 0) : 0;
  const textLower = text.toLowerCase();

  if (!facts.hasDob) {
    issues.push({
      id: 'missing-dob',
      severity: 'High',
      confidence: clamp(94 - (ocrConfidence < 55 ? 12 : 0)),
      title: 'Missing patient date of birth',
      reference: 'Patient demographics',
      fix: 'Collect the patient DOB from the intake form or ID and add it before submission.',
      evidence:
        'No DOB, Date of Birth, or Birth Date label was found in the extracted packet text.',
    });
  }

  if (!facts.hasDiagnosis) {
    issues.push({
      id: 'missing-diagnosis',
      severity: 'Critical',
      confidence: clamp(92 - (ocrConfidence < 55 ? 10 : 0)),
      title: 'Missing diagnosis',
      reference: 'Discharge summary / coding section',
      fix: 'Attach the diagnosis page or enter the principal ICD-10 diagnosis from the discharge summary.',
      evidence:
        'No diagnosis label or ICD-10 diagnosis pattern was extracted from the uploaded PDF.',
    });
  }

  if (!facts.hasSignature) {
    issues.push({
      id: 'missing-signature',
      severity: 'High',
      confidence: clamp(88 - (facts.hasDoctor ? 6 : 0)),
      title: 'Missing signature evidence',
      reference: 'Authorization / discharge signature block',
      fix: 'Upload a signed discharge summary or authorization page, or request physician e-signature.',
      evidence:
        'The extracted text has no signature, signed-by, e-sign, or authorized-signature marker.',
    });
  }

  if (
    !facts.hasInsuranceId ||
    insurance === emptyValue ||
    insurance.replace(/[^A-Z0-9]/gi, '').length < 8
  ) {
    issues.push({
      id: 'incomplete-insurance-id',
      severity: facts.hasInsuranceId ? 'Medium' : 'High',
      confidence: facts.hasInsuranceId ? 82 : 91,
      title: facts.hasInsuranceId ? 'Insurance ID appears incomplete' : 'Missing insurance ID',
      reference: 'Insurance card / payer details',
      fix: 'Verify the full member or policy ID against the insurance card and update the claim packet.',
      evidence: facts.hasInsuranceId
        ? `Extracted insurance ID "${insurance}" is shorter than expected.`
        : 'No member ID, policy number, or insurance number was extracted.',
    });
  }

  if (!facts.hasInvoice) {
    issues.push({
      id: 'missing-invoice-total',
      severity: 'High',
      confidence: 90,
      title: 'Missing invoice total',
      reference: 'Hospital invoice',
      fix: 'Attach an itemized bill with a visible grand total or enter the total billed amount.',
      evidence: 'No total billed amount, grand total, net amount, or invoice total was found.',
    });
  } else if (
    candidateLineSum > 0 &&
    invoiceTotal > 0 &&
    Math.abs(candidateLineSum - invoiceTotal) > Math.max(10, invoiceTotal * 0.02)
  ) {
    issues.push({
      id: 'invoice-total-mismatch',
      severity: 'High',
      confidence: 86,
      title: 'Invoice total mismatch',
      reference: 'Itemized bill',
      fix: `Reconcile line items before submission. Extracted line items sum to INR ${Math.round(
        candidateLineSum
      ).toLocaleString(
        'en-IN'
      )} while the total is INR ${Math.round(invoiceTotal).toLocaleString('en-IN')}.`,
      evidence:
        'The extracted numeric line items do not reconcile with the detected invoice total.',
    });
  }

  if (
    ocrConfidence < 58 ||
    text.length < 250 ||
    /blur|blurry|illegible|unreadable|low\s+quality/.test(textLower)
  ) {
    issues.push({
      id: 'low-scan-quality',
      severity: ocrConfidence < 40 ? 'High' : 'Medium',
      confidence: clamp(96 - ocrConfidence / 3),
      title: 'Blurry or low-text scan detected',
      reference: 'Uploaded PDF quality',
      fix: 'Rescan the packet at 300 DPI or upload a text-readable PDF so OCR can verify all fields.',
      evidence: `OCR confidence is ${ocrConfidence}% with ${text.length.toLocaleString()} extracted characters.`,
    });
  }

  if (
    facts.pageCount <= 1 &&
    !hasAny(text, [/insurance/i, /diagnosis/i, /invoice|bill/i, /authorization|claim\s*form/i])
  ) {
    issues.push({
      id: 'missing-pages',
      severity: 'Medium',
      confidence: 78,
      title: 'Possible missing pages',
      reference: 'Packet completeness',
      fix: 'Confirm the packet includes insurance, clinical, authorization, and billing pages.',
      evidence: 'Only one page was detected and key claim packet sections were not all present.',
    });
  }

  if (facts.admissionDate && facts.dischargeDate && facts.dischargeDate < facts.admissionDate) {
    issues.push({
      id: 'date-logic',
      severity: 'High',
      confidence: 90,
      title: 'Admission and discharge dates are inconsistent',
      reference: 'Clinical dates',
      fix: `Correct the date sequence. Admission was extracted as ${facts.admissionDate}, discharge as ${facts.dischargeDate}.`,
      evidence: 'Discharge date is earlier than admission date.',
    });
  }

  return issues;
};

const buildMetrics = (
  issues: ValidationIssue[],
  ocrConfidence: number
): Pick<ValidationReport, 'metrics' | 'readinessScore' | 'healthScore'> => {
  const severityPenalty = issues.reduce((sum, issue) => {
    if (issue.severity === 'Critical') return sum + 24;
    if (issue.severity === 'High') return sum + 16;
    if (issue.severity === 'Medium') return sum + 9;
    return sum + 4;
  }, 0);
  const readinessScore = clamp(100 - severityPenalty - Math.max(0, 75 - ocrConfidence) * 0.35);
  const healthScore = clamp((readinessScore + ocrConfidence) / 2);
  const highRisk = issues.some(
    (issue) => issue.severity === 'Critical' || issue.severity === 'High'
  );
  const risk = readinessScore >= 86 ? 'Low' : highRisk ? 'High' : 'Med';
  const helper =
    issues.length === 0
      ? 'No blockers found'
      : `${issues.length} contextual ${issues.length === 1 ? 'issue' : 'issues'} found`;

  return {
    readinessScore,
    healthScore,
    metrics: [
      {
        id: 'health',
        label: 'Claim Health',
        value: String(healthScore),
        unit: '/100',
        color:
          healthScore >= 85 ? 'text-success' : healthScore >= 65 ? 'text-warning' : 'text-danger',
        helper,
      },
      {
        id: 'readiness',
        label: 'Readiness',
        value: String(readinessScore),
        unit: '%',
        color:
          readinessScore >= 85
            ? 'text-success'
            : readinessScore >= 65
              ? 'text-warning'
              : 'text-danger',
        helper: readinessScore >= 85 ? 'Ready for final review' : 'Repairs needed first',
      },
      {
        id: 'ocr',
        label: 'OCR Confidence',
        value: String(ocrConfidence),
        unit: '%',
        color:
          ocrConfidence >= 85
            ? 'text-success'
            : ocrConfidence >= 60
              ? 'text-warning'
              : 'text-danger',
        helper: ocrConfidence >= 85 ? 'Strong text extraction' : 'Review scan quality',
      },
      {
        id: 'risk',
        label: 'Rejection Risk',
        value: risk,
        unit: '',
        color: risk === 'Low' ? 'text-success' : risk === 'High' ? 'text-danger' : 'text-warning',
        helper: highRisk ? 'Likely payer rejection' : 'Based on extracted evidence',
      },
    ],
  };
};

const buildLocalReport = ({
  text,
  fields,
  facts,
  filename,
  pages,
  ocrConfidence,
}: {
  text: string;
  fields: ClaimField[];
  facts: ReturnType<typeof buildLocalExtraction>['facts'];
  filename: string;
  pages: number;
  ocrConfidence: number;
}): ValidationReport => {
  const issues = buildLocalIssues(text, fields, facts, ocrConfidence);
  const { metrics, readinessScore, healthScore } = buildMetrics(issues, ocrConfidence);
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const extractionMethod = text.trim().length > 0 ? 'pdf_text' : 'ocr_required';

  return {
    documentGroups: inferDocumentGroups(text, pages, ocrConfidence),
    metrics,
    issues,
    timeline: [
      { id: 'uploaded', label: 'Claim Uploaded', time: now, done: true },
      {
        id: 'parsed',
        label: extractionMethod === 'pdf_text' ? 'PDF Text Parsed' : 'OCR Required',
        time: now,
        done: true,
      },
      { id: 'classified', label: 'Documents Classified', time: now, done: true },
      { id: 'validation', label: 'Dynamic Validation Complete', time: now, done: true },
      { id: 'repairs', label: 'Repair Suggestions Generated', time: now, done: issues.length > 0 },
      {
        id: 'ready',
        label: 'Submission Ready',
        time: readinessScore >= 85 ? now : 'Pending repairs',
        done: readinessScore >= 85,
      },
    ],
    pdfStructure: [
      `01  Source packet: ${filename}`,
      '02  Extracted demographics and payer fields',
      '03  Clinical validation evidence',
      '04  Billing reconciliation notes',
      '05  Repair log and submission readiness',
    ],
    summary:
      issues.length === 0
        ? 'The uploaded PDF was parsed and no major validation blockers were detected from the extracted content.'
        : `The uploaded PDF was parsed and ${issues.length} claim-specific ${issues.length === 1 ? 'issue was' : 'issues were'} detected from its actual content.`,
    readinessScore,
    healthScore,
    ocrConfidence,
    source: 'local_analysis',
    extractionMethod,
  };
};

const isClaimAudit = (value: unknown): value is ClaimAudit => {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Partial<ClaimAudit>;
  return Boolean(
    audit.document_metadata && audit.extracted_data && Array.isArray(audit.validation_errors)
  );
};

const runAiValidation = async ({
  fileName,
  pageCount,
  text,
  fields,
  localReport,
  localAudit,
}: {
  fileName: string;
  pageCount: number;
  text: string;
  fields: ClaimField[];
  localReport: ValidationReport;
  localAudit: ClaimAudit;
}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4028',
        'X-Title': 'InsureFlow AI',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert Medical Claims Auditor and Data Extraction Engine. Return strict JSON only. Extract values exactly as they appear, never guess missing values, and use null for missing scalar fields. Validate the claim holistically and add every missing critical item, inconsistency, illegible field, signature gap, financial mismatch, and chronological error to claimAudit.validation_errors.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Extract a strict medical-claim audit JSON object and validate completeness for patient demographics, insurance details, hospital/provider details, clinical justification, ICD-10/procedure data, expected stay, financials, and patient/doctor/hospital authorizations. Preserve the existing UI fields and validation report too.',
              required_output_shape: {
                fields,
                validation: localReport,
                claimAudit: localAudit,
              },
              document: {
                fileName,
                pageCount,
                extractedText: text.slice(0, MAX_PROMPT_CHARS),
              },
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const parsed = parseJsonResponse(content);
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      fields: Array.isArray(parsed.fields) ? parsed.fields : fields,
      validation: {
        ...localReport,
        ...(parsed.validation && typeof parsed.validation === 'object' ? parsed.validation : {}),
        source: 'ai',
      },
      claimAudit: isClaimAudit(parsed.claimAudit)
        ? parsed.claimAudit
        : isClaimAudit(parsed.audit)
          ? parsed.audit
          : isClaimAudit(parsed)
            ? parsed
            : localAudit,
    };
  } catch {
    return null;
  }
};

const parseJsonResponse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    return objectMatch ? JSON.parse(objectMatch[0]) : null;
  }
};

export async function POST(req: Request) {
  try {
    const { user, response: authResponse } = await requireUser();
    if (authResponse) return authResponse;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF claim packets are supported.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await extractTextFromPdfBuffer(buffer);
    let text = pdfData.text;
    const pageCount = pdfData.pageCount;
    let extractionMethod: 'pdf_text' | 'ocr_required' | 'ai_ocr' = text.trim().length > 0 ? 'pdf_text' : 'ocr_required';
    let ocrSkippedReason = '';

    // If scanned (no text), try to lazy-load OCR
    if (extractionMethod === 'ocr_required') {
      try {
        // lazy-init canvas, pdfjs rendering, and tesseract
        const { Canvas, loadImage } = require('@napi-rs/canvas');
        const Tesseract = require('tesseract.js');
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

        // Let's load the pdf
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdfDocument = await loadingTask.promise;
        const ocrTexts: string[] = [];

        // Loop through pages (limit to 3 for performance)
        const pagesToOcr = Math.min(pdfDocument.numPages, 3);
        for (let i = 1; i <= pagesToOcr; i++) {
          const page = await pdfDocument.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = new Canvas(viewport.width, viewport.height);
          const context = canvas.getContext('2d');

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          const imageBuffer = await canvas.toBuffer('image/png');
          const result = await Tesseract.recognize(imageBuffer, 'eng');
          if (result.data.text) {
            ocrTexts.push(result.data.text);
          }
        }

        if (ocrTexts.length > 0) {
          text = cleanText(ocrTexts.join('\n'));
          extractionMethod = 'ai_ocr';
        } else {
          ocrSkippedReason = 'No text extracted from OCR';
        }
      } catch (err: any) {
        ocrSkippedReason = `OCR engine initialization failed: ${err.message}`;
      }
    }

    const localExtraction = buildLocalExtraction(text, pageCount, file.name);
    const localReport = buildLocalReport({
      text,
      fields: localExtraction.fields,
      facts: localExtraction.facts,
      filename: file.name,
      pages: pageCount,
      ocrConfidence: localExtraction.ocrConfidence,
    });
    // Update extractionMethod in validation report
    localReport.extractionMethod = extractionMethod;
    if (ocrSkippedReason) {
      (localReport as any).ocrSkippedReason = ocrSkippedReason;
    }

    const localAudit = buildClaimAudit({
      text,
      pages: pageCount,
      ocrConfidence: localExtraction.ocrConfidence,
      fields: localExtraction.fields,
      extractionMethod,
    });
    const aiResult = await runAiValidation({
      fileName: file.name,
      pageCount,
      text,
      fields: localExtraction.fields,
      localReport,
      localAudit,
    });

    const finalReport = aiResult?.validation || localReport;
    const finalAudit = normalizeClaimAudit({
      audit: aiResult?.claimAudit || localAudit,
      fallbackAudit: localAudit,
      fallbackFields: aiResult?.fields || localExtraction.fields,
      text,
      pages: pageCount,
      extractionMethod,
    });
    const finalFields = buildClaimFieldsFromAudit(finalAudit, aiResult?.fields || localExtraction.fields);

    // Save to liveClaims store
    try {
      const { saveReviewClaim } = require('@/lib/liveClaims');
      
      // Construct ExtractedClaimData
      const getFieldValue = (id: string) => finalFields.find((f: any) => f.id === id)?.value || '';
      const extracted = finalAudit.extracted_data;

      const confirmedData = {
        patient: {
          full_name: traceValue(extracted.patient.full_name) || getFieldValue('patientName') || '',
          date_of_birth: traceValue(extracted.patient.dob) || '',
          gender: traceValue(extracted.patient.gender) || '',
          address: '',
          contact_phone: traceValue(extracted.patient.contact_number) || '',
          contact_email: '',
        },
        insurance: {
          policyholder_name: traceValue(extracted.patient.full_name) || getFieldValue('patientName') || '',
          group_number: traceValue(extracted.insurance.corporate_or_group_id) || '',
          member_id: traceValue(extracted.insurance.member_id) || getFieldValue('insuranceNumber') || '',
          payer_id: '',
          plan_name: traceValue(extracted.insurance.tpa_or_provider_name) || '',
        },
        pre_authorization: {
          approval_code: '',
          authorized_from: '',
          authorized_to: '',
        },
        clinical: {
          admission_date: traceValue(extracted.clinical.admission_date) || '',
          discharge_date: '',
          attending_physician: traceValue(extracted.hospital.treating_doctor) || getFieldValue('doctorName') || '',
          hospital_npi: '',
          hospital_tax_id: '',
          facility_name: traceValue(extracted.hospital.facility_name) || getFieldValue('hospital') || '',
          principal_diagnosis: traceValue(extracted.clinical.diagnosis) || getFieldValue('diagnosis') || '',
        },
        coding: {
          icd10_codes: (traceValue(extracted.clinical.icd_10_codes) || []).map((code: string) => ({
            code,
            description: '',
            confidence: extracted.clinical.icd_10_codes.confidence / 100,
          })),
          cpt_codes: [],
        },
        billing: {
          total_billed_amount: String(traceValue(extracted.financial.expected_total_cost) || moneyToNumber(getFieldValue('invoiceTotal')) || '0'),
          line_items: [],
        },
        extraction_meta: {
          overall_confidence: finalReport.ocrConfidence,
          low_confidence_fields: [],
          requires_manual_review: finalAudit.validation_errors.length > 0,
        },
      };

      await saveReviewClaim({
        userId: user.id,
        claimId: req.headers.get('x-claim-id') || `CLM-${Math.floor(1000 + Math.random() * 9000)}`,
        confirmedData,
        reviewReasons: finalAudit.validation_errors,
      });
    } catch (saveErr) {
      console.error('Failed to auto-save claim to store:', saveErr);
    }

    return NextResponse.json({
      fields: finalFields,
      validation: finalReport,
      claimAudit: finalAudit,
      extractedTextLength: text.length,
      pageCount,
      extractionSource: aiResult ? 'openrouter' : 'local_pdf_pipeline',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error during extraction' },
      { status: 500 }
    );
  }
}
