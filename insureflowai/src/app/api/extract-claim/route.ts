import { NextResponse } from 'next/server';
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

const MAX_PROMPT_CHARS = 24000;
type PdfParseModule = {
  PDFParse: new (options: { data: Buffer }) => {
    getText: () => Promise<{ text?: string; total?: number }>;
    destroy: () => Promise<void>;
  };
};

const loadPdfParse = () => {
  const nodeRequire = eval('require') as NodeRequire;
  return nodeRequire('pdf-parse') as PdfParseModule;
};

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
    // eslint-disable-next-line no-control-regex
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
    const { PDFParse } = loadPdfParse();
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const text = cleanText(parsed.text || '');

      return {
        text,
        pageCount: Math.max(1, parsed.total || 1),
      };
    } finally {
      await parser.destroy();
    }
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

const parseJsonResponse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    return objectMatch ? JSON.parse(objectMatch[0]) : null;
  }
};

const runAiValidation = async ({
  fileName,
  pageCount,
  text,
  fields,
  localReport,
}: {
  fileName: string;
  pageCount: number;
  text: string;
  fields: ClaimField[];
  localReport: ValidationReport;
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
              'You are InsureFlow AI for healthcare claim validation. Return strict JSON only. Use only the uploaded document text and the extracted fields. Do not reuse canned demo issues. Produce document-specific confidence scores and contextual repair suggestions.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Validate this claim packet for missing DOB, invoice mismatch, missing signatures, incomplete insurance ID, blurry scans, inconsistent totals, missing pages, missing diagnosis, date logic, payer/claim readiness, and any other claim-specific backend checks evident in the text.',
              required_output_shape: {
                fields,
                validation: localReport,
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
    };
  } catch {
    return null;
  }
};

export async function POST(req: Request) {
  try {
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
    const text = pdfData.text;
    const pageCount = pdfData.pageCount;
    const localExtraction = buildLocalExtraction(text, pageCount, file.name);
    const localReport = buildLocalReport({
      text,
      fields: localExtraction.fields,
      facts: localExtraction.facts,
      filename: file.name,
      pages: pageCount,
      ocrConfidence: localExtraction.ocrConfidence,
    });
    const aiResult = await runAiValidation({
      fileName: file.name,
      pageCount,
      text,
      fields: localExtraction.fields,
      localReport,
    });

    return NextResponse.json({
      fields: aiResult?.fields || localExtraction.fields,
      validation: aiResult?.validation || localReport,
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
