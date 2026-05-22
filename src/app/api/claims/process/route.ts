import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import path from 'path';
import { pathToFileURL } from 'url';
import { inflateSync } from 'zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const TEXT_PAGE_THRESHOLD = 40;
const TEXT_PACKET_THRESHOLD = 180;
const OCR_MIN_TEXT_LENGTH = 10;
const PDF_WORKER_PATH = path.join(
  process.cwd(),
  'node_modules',
  'pdfjs-dist',
  'legacy',
  'build',
  'pdf.worker.mjs'
);
const resolveRuntimeModule = (specifier: string) => {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire.resolve(specifier);
};

const canResolveRuntimeModule = (specifier: string) => {
  try {
    resolveRuntimeModule(specifier);
    return true;
  } catch {
    return false;
  }
};

const routeCapabilities: CapabilityMatrix = {
  pdf_text_available: true,
  pdf_render_available:
    canResolveRuntimeModule('pdfjs-dist/legacy/build/pdf.mjs') &&
    canResolveRuntimeModule('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  canvas_available: canResolveRuntimeModule('@napi-rs/canvas'),
  ocr_available:
    canResolveRuntimeModule('tesseract.js') &&
    canResolveRuntimeModule('tesseract.js/src/worker-script/node/index.js') &&
    canResolveRuntimeModule('tesseract.js-core/tesseract-core-lstm.wasm.js') &&
    canResolveRuntimeModule('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
};

const getTesseractOptions = () => ({
  workerPath: resolveRuntimeModule('tesseract.js/src/worker-script/node/index.js'),
  corePath: path.dirname(resolveRuntimeModule('tesseract.js-core/tesseract-core-lstm.wasm.js')),
  langPath: path.dirname(
    resolveRuntimeModule('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')
  ),
  gzip: true,
  cacheMethod: 'none',
  workerBlobURL: false,
});

type ExtractionMethod = 'pdf_text' | 'pdf_text_only' | 'ocr' | 'mixed' | 'metadata_only';
type FieldMethod = 'pdf_text' | 'ocr';
type PdfKind = 'text_layer' | 'scanned_or_image';
type PipelineStage =
  | 'upload_parse_failed'
  | 'pdf_parse_failed'
  | 'pdf_text_extract_failed'
  | 'pdf_renderer_failed'
  | 'canvas_init_failed'
  | 'ocr_worker_failed'
  | 'ocr_extract_failed'
  | 'classification_failed'
  | 'entity_extraction_failed'
  | 'validation_failed';
type PageDocType =
  | 'insurance_card'
  | 'tpa_card'
  | 'aadhaar'
  | 'pan'
  | 'preauth_form'
  | 'claim_form'
  | 'invoice'
  | 'final_bill'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_report'
  | 'radiology'
  | 'doctor_notes'
  | 'hospital_form'
  | 'ub04'
  | 'unknown';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type UiSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
type RejectionRisk = 'low' | 'medium' | 'high';

type PageText = {
  page: number;
  text: string;
  method: FieldMethod;
  confidence: number;
};

type ClassifiedPage = {
  page: number;
  type: PageDocType;
  confidence: number;
};

type TraceableField<T = string | number | boolean | string[] | null> = {
  value: T;
  confidence: number;
  source_page: number | null;
  source_doc_type: PageDocType | null;
  method: FieldMethod | null;
};

type ExtractedFields = {
  patient: {
    full_name: TraceableField<string | null>;
    dob: TraceableField<string | null>;
    gender: TraceableField<string | null>;
    age: TraceableField<number | null>;
    phone: TraceableField<string | null>;
    address: TraceableField<string | null>;
  };
  insurance: {
    provider_name: TraceableField<string | null>;
    tpa_name: TraceableField<string | null>;
    policy_number: TraceableField<string | null>;
    member_id: TraceableField<string | null>;
    corporate_or_group_id: TraceableField<string | null>;
    insurance_id: TraceableField<string | null>;
  };
  hospital: {
    facility_name: TraceableField<string | null>;
    doctor_name: TraceableField<string | null>;
    registration_number: TraceableField<string | null>;
    admission_date: TraceableField<string | null>;
    discharge_date: TraceableField<string | null>;
  };
  clinical: {
    diagnosis: TraceableField<string | null>;
    icd10_codes: TraceableField<string[]>;
    symptoms: TraceableField<string | null>;
    surgery: TraceableField<string | null>;
    procedure: TraceableField<string | null>;
    length_of_stay: TraceableField<number | null>;
    emergency_case: TraceableField<boolean | null>;
  };
  financial: {
    room_rent: TraceableField<number | null>;
    icu_charges: TraceableField<number | null>;
    ot_charges: TraceableField<number | null>;
    medicine: TraceableField<number | null>;
    pharmacy: TraceableField<number | null>;
    investigations: TraceableField<number | null>;
    professional_fees: TraceableField<number | null>;
    final_bill: TraceableField<number | null>;
    total_claimed: TraceableField<number | null>;
  };
  authorization: {
    patient_signature: TraceableField<boolean | null>;
    doctor_signature: TraceableField<boolean | null>;
    hospital_seal: TraceableField<boolean | null>;
    approval_stamp: TraceableField<boolean | null>;
  };
};

type ValidationError = {
  id: string;
  category: 'identity' | 'insurance' | 'clinical' | 'financial' | 'authorization' | 'document';
  severity: Severity;
  issue: string;
  evidence: string;
  source_pages: number[];
  fields: string[];
};

type RepairSuggestion = {
  severity: Severity;
  issue: string;
  impact: string;
  fix: string;
};

type ClaimSession = {
  claimId: string;
  uploadSessionId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
};

type V2Response = {
  success: true;
  extractionMethod: ExtractionMethod;
  capabilities: CapabilityMatrix;
  ocrSkippedReason?: string;
  claimId: string;
  uploadSessionId: string;
  pageCount: number;
  classifiedPages: ClassifiedPage[];
  extractedFields: ExtractedFields;
  validationErrors: ValidationError[];
  claimHealth: number;
  readiness: number;
  ocrConfidence: number;
  rejectionRisk: RejectionRisk;
  repairSuggestions: RepairSuggestion[];
  intake: ClaimSession;
  pdfType: PdfKind;
};

type CapabilityMatrix = {
  pdf_text_available: boolean;
  pdf_render_available: boolean;
  canvas_available: boolean;
  ocr_available: boolean;
};

type PipelineErrorBody = {
  success: false;
  stage: PipelineStage;
  error: string;
  claimId?: string;
  uploadSessionId?: string;
};

type Pattern<T> = {
  regex: RegExp;
  normalize?: (value: string, pageText: string) => T | null;
  confidence?: number;
  pageTypes?: PageDocType[];
};

type Candidate<T> = {
  value: T;
  confidence: number;
  page: number;
  docType: PageDocType;
  method: FieldMethod;
  raw: string;
};

type UiClaimField = {
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

type UiValidationIssue = {
  id: string;
  severity: UiSeverity;
  confidence: number;
  title: string;
  reference: string;
  fix: string;
  evidence?: string;
};

type UiValidationReport = {
  documentGroups: Array<{
    id: string;
    title: string;
    pages: string;
    confidence: number;
    status: string;
    summary: string;
    tone: 'success' | 'warning' | 'danger' | 'info';
  }>;
  metrics: Array<{
    id: string;
    label: string;
    value: string;
    unit: string;
    color: string;
    helper: string;
  }>;
  issues: UiValidationIssue[];
  timeline: Array<{ id: string; label: string; time: string; done: boolean }>;
  pdfStructure: string[];
  summary: string;
  readinessScore: number;
  healthScore: number;
  ocrConfidence: number;
  source: 'local_analysis';
  extractionMethod: 'pdf_text' | 'ocr_required' | 'ai_ocr';
};

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

class PipelineError extends Error {
  constructor(
    public stage: PipelineStage,
    message: string,
    public status = 422
  ) {
    super(message);
  }
}

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeWhitespace = (value = '') =>
  value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeForEntityMatching = (value = '') =>
  normalizeWhitespace(value)
    .replace(/(^|[^A-Za-z0-9])pt\.?(?=\s|$)/gi, '$1patient')
    .replace(/[^\S\r\n]{2,}/g, ' ');

const cleanValue = (value = '') =>
  normalizeWhitespace(value)
    .replace(/^[\s:;|,-]+|[\s:;|,-]+$/g, '')
    .replace(/\s+([,.:;])/g, '$1');

const toGlobalRegex = (regex: RegExp) => {
  regex.lastIndex = 0;
  return regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
};

const capturedValue = (match: RegExpMatchArray) =>
  [...match]
    .slice(1)
    .reverse()
    .find((value) => value !== undefined && value.trim().length > 0) || match[0];

const hasValue = (field: TraceableField<unknown>) => {
  if (field.value === null || field.value === undefined) return false;
  if (typeof field.value === 'string') return field.value.trim().length > 0;
  if (Array.isArray(field.value)) return field.value.length > 0;
  return true;
};

const textFingerprint = (text: string) =>
  cleanValue(text.toLowerCase())
    .replace(/\d+/g, '#')
    .slice(0, 900);

const createId = (prefix: string) => {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '';
  return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
};

const makeEmptyTrace = <T,>(value: T): TraceableField<T> => ({
  value,
  confidence: 0,
  source_page: null,
  source_doc_type: null,
  method: null,
});

const makeTrace = <T,>(candidate: Candidate<T> | null, emptyValue: T): TraceableField<T> => {
  if (!candidate) return makeEmptyTrace(emptyValue);
  return {
    value: candidate.value,
    confidence: clamp(candidate.confidence),
    source_page: candidate.page,
    source_doc_type: candidate.docType,
    method: candidate.method,
  };
};

const parseMoney = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatMoney = (value: number | null) =>
  value && value > 0 ? `INR ${Math.round(value).toLocaleString('en-IN')}` : '';

const monthIndex = (value: string) => {
  const key = value.toLowerCase().slice(0, 3);
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key);
  return month >= 0 ? String(month + 1).padStart(2, '0') : null;
};

const normalizeYear = (value: string) => (value.length === 2 ? `20${value}` : value);

const normalizeDate = (value: string) => {
  const cleaned = cleanValue(value);
  const iso = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const parts = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    return `${normalizeYear(parts[3])}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  const dayMonthName = cleaned.match(/^(\d{1,2})\s*([A-Za-z]{3,9})\s*(\d{2,4})$/);
  if (dayMonthName) {
    const month = monthIndex(dayMonthName[2]);
    return month ? `${normalizeYear(dayMonthName[3])}-${month}-${dayMonthName[1].padStart(2, '0')}` : cleaned || null;
  }

  const monthNameDay = cleaned.match(/^([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(\d{2,4})$/);
  if (monthNameDay) {
    const month = monthIndex(monthNameDay[1]);
    return month ? `${normalizeYear(monthNameDay[3])}-${month}-${monthNameDay[2].padStart(2, '0')}` : cleaned || null;
  }

  return cleaned || null;
};

const daysBetween = (from?: string | null, to?: string | null) => {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
};

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|patient|name|insured|beneficiary)\b/g, ' ')
    .replace(/[^a-z]/g, '');

const severityWeight = (severity: Severity) => {
  if (severity === 'critical') return 24;
  if (severity === 'high') return 16;
  if (severity === 'medium') return 9;
  return 4;
};

const uiSeverity = (severity: Severity): UiSeverity =>
  severity === 'critical'
    ? 'Critical'
    : severity === 'high'
      ? 'High'
      : severity === 'medium'
        ? 'Medium'
        : 'Low';

const statusFor = (status: number) => ({ status });

const countPdfPages = (buffer: Buffer) => {
  const pdf = buffer.toString('latin1');
  return Math.max(1, (pdf.match(/\/Type\s*\/Page\b/g) || []).length);
};

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

const pageTextsFromCombinedText = (
  text: string,
  pageCount: number,
  confidence: number,
  method: FieldMethod = 'pdf_text'
): PageText[] => {
  const normalizedText = normalizeWhitespace(text);

  if (!normalizedText) {
    return Array.from({ length: pageCount }, (_, index) => ({
      page: index + 1,
      text: '',
      method,
      confidence: 0,
    }));
  }

  const chunkSize = Math.ceil(normalizedText.length / pageCount);

  return Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    text: normalizedText.slice(index * chunkSize, (index + 1) * chunkSize),
    method,
    confidence,
  }));
};

const extractPdfTextWithoutRendering = (buffer: Buffer, pageCount: number) => {
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

    for (const arrayMatch of streamText.matchAll(/\[((?:\([^)]*\)|<[^>]+>|-?\d+(?:\.\d+)?|\s)+)\]\s*TJ/g)) {
      const arrayText = Array.from(arrayMatch[1].matchAll(/\(([^()]*)\)|<([0-9A-Fa-f]+)>/g))
        .map((part) => (part[1] ? decodePdfLiteralText(part[1]) : decodePdfHexText(part[2])))
        .join('');
      if (arrayText.trim()) textChunks.push(arrayText);
    }
  }

  const text = normalizeWhitespace(textChunks.join(' '));
  return {
    pageCount,
    pages: pageTextsFromCombinedText(text, pageCount, text.length >= TEXT_PACKET_THRESHOLD ? 92 : text.length > 0 ? 55 : 0),
    source: 'raw_pdf_text',
  };
};

async function extractPdfTextWithPdfParse(buffer: Buffer, pageCount: number) {
  try {
    const runtimeRequire = eval('require') as NodeRequire;
    const pdfParseModule = runtimeRequire('pdf-parse') as {
      PDFParse?: new (options: { data: Buffer }) => {
        getText: () => Promise<{
          text?: string;
          total?: number;
          pages?: Array<{ num?: number; text?: string }>;
        }>;
        destroy?: () => Promise<void>;
      };
    };

    if (!pdfParseModule.PDFParse) return null;

    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = normalizeWhitespace(result.text || '');
      const totalPages = Math.max(1, result.total || pageCount, result.pages?.length || 0);
      const pageResults = result.pages || [];
      const pages = Array.from({ length: totalPages }, (_, index) => {
        const pageNumber = index + 1;
        const pageResult = pageResults.find((page) => page.num === pageNumber) || pageResults[index];
        const pageText = normalizeWhitespace(pageResult?.text || '');

        return {
          page: pageNumber,
          text: pageText,
          method: 'pdf_text' as const,
          confidence: pageText.length >= TEXT_PAGE_THRESHOLD ? 98 : pageText.length > 0 ? 55 : 0,
        };
      });

      return {
        pageCount: totalPages,
        pages: pages.some((page) => page.text.length > 0)
          ? pages
          : pageTextsFromCombinedText(
              text,
              totalPages,
              text.length >= TEXT_PACKET_THRESHOLD ? 98 : text.length > 0 ? 55 : 0
            ),
        source: 'pdf_parse',
      };
    } finally {
      await parser.destroy?.();
    }
  } catch {
    return null;
  }
}

async function extractPdfTextFirst(buffer: Buffer, pageCount: number): Promise<{
  pageCount: number;
  pages: PageText[];
  source: string;
}> {
  const rawExtraction = extractPdfTextWithoutRendering(buffer, pageCount);
  const rawTextLength = rawExtraction.pages.reduce((sum, page) => sum + page.text.length, 0);
  const parsedExtraction = await extractPdfTextWithPdfParse(buffer, pageCount);
  if (!parsedExtraction) return rawExtraction;

  const parsedTextLength = parsedExtraction.pages.reduce((sum, page) => sum + page.text.length, 0);
  if (parsedTextLength >= TEXT_PACKET_THRESHOLD) return parsedExtraction;
  return parsedTextLength > rawTextLength ? parsedExtraction : rawExtraction;
}

async function ensurePdfJsNodePolyfills() {
  if (globalThis.DOMMatrix && globalThis.ImageData && globalThis.Path2D) return;

  try {
    const canvas = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ||= canvas.DOMMatrix as typeof globalThis.DOMMatrix;
    globalThis.ImageData ||= canvas.ImageData as typeof globalThis.ImageData;
    globalThis.Path2D ||= canvas.Path2D as typeof globalThis.Path2D;
  } catch (error) {
    throw new PipelineError(
      'canvas_init_failed',
      error instanceof Error
        ? error.message
        : 'PDF geometry polyfills could not be initialized.',
      500
    );
  }
}

async function loadPdfJs(): Promise<PdfJsModule> {
  await ensurePdfJsNodePolyfills();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(PDF_WORKER_PATH).href;
  return pdfjs;
}

async function runOcrFallback(buffer: Buffer, pageCount: number): Promise<PageText[]> {
  if (!routeCapabilities.pdf_render_available) {
    throw new PipelineError('pdf_renderer_failed', 'PDF renderer is unavailable in this runtime.', 200);
  }
  if (!routeCapabilities.canvas_available) {
    throw new PipelineError('canvas_init_failed', 'Canvas renderer is unavailable in this runtime.', 200);
  }
  if (!routeCapabilities.ocr_available) {
    throw new PipelineError('ocr_worker_failed', 'OCR worker is unavailable in this runtime.', 200);
  }

  let pdfjs: PdfJsModule;
  let Canvas: new (width: number, height: number) => {
    getContext: (type: '2d') => unknown;
    toBuffer: (type: 'image/png') => Promise<Buffer> | Buffer;
  };
  let Tesseract: {
    createWorker?: (
      language?: string,
      oem?: number,
      options?: Record<string, unknown>
    ) => Promise<{
      recognize: (image: Buffer) => Promise<{ data: { text?: string; confidence?: number } }>;
      terminate: () => Promise<unknown>;
    }>;
    OEM?: { LSTM_ONLY?: number };
    recognize?: (
      image: Buffer,
      language: string
    ) => Promise<{ data: { text?: string; confidence?: number } }>;
  };

  try {
    pdfjs = await loadPdfJs();
  } catch (error) {
    throw new PipelineError(
      'pdf_renderer_failed',
      error instanceof Error ? error.message : 'PDF renderer could not be loaded.',
      500
    );
  }

  try {
    const canvasModule = await import('@napi-rs/canvas');
    Canvas = canvasModule.Canvas as typeof Canvas;
  } catch (error) {
    throw new PipelineError(
      'canvas_init_failed',
      error instanceof Error ? error.message : 'Canvas renderer could not be initialized.',
      500
    );
  }

  try {
    const imported = await import('tesseract.js');
    Tesseract = ((imported as any).default || imported) as typeof Tesseract;
  } catch (error) {
    throw new PipelineError(
      'ocr_worker_failed',
      error instanceof Error ? error.message : 'OCR worker could not be initialized.',
      500
    );
  }

  let worker:
    | Awaited<ReturnType<NonNullable<typeof Tesseract.createWorker>>>
    | null = null;

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]);
    const document = await loadingTask.promise;
    const pagesToOcr = pageCount;
    const pages: PageText[] = [];

    if (typeof Tesseract.createWorker === 'function') {
      worker = await Tesseract.createWorker('eng', Tesseract.OEM?.LSTM_ONLY ?? 1, {
        ...getTesseractOptions(),
      });
    }

    for (let pageNumber = 1; pageNumber <= pagesToOcr; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d') as never;

      await page.render({ canvasContext: context, viewport } as never).promise;
      const imageBuffer = await canvas.toBuffer('image/png');
      const result = worker
        ? await worker.recognize(imageBuffer)
        : await Tesseract.recognize?.(imageBuffer, 'eng');
      const cleaned = normalizeWhitespace(result?.data.text || '');

      pages.push({
        page: pageNumber,
        text: cleaned.length >= OCR_MIN_TEXT_LENGTH ? cleaned : '',
        method: 'ocr',
        confidence: cleaned.length >= OCR_MIN_TEXT_LENGTH ? clamp(result?.data.confidence || 0) : 0,
      });
    }

    await worker?.terminate();
    await document.destroy();
    return pages;
  } catch (error) {
    await worker?.terminate().catch(() => undefined);
    throw new PipelineError(
      'ocr_extract_failed',
      error instanceof Error ? error.message : 'OCR extraction failed.',
      500
    );
  }
}

const classifiers: Array<{
  type: PageDocType;
  confidence: number;
  patterns: RegExp[];
}> = [
  {
    type: 'insurance_card',
    confidence: 94,
    patterns: [/insurance\s+card/i, /policy\s*(?:number|no)/i, /member\s*(?:id|number)/i],
  },
  {
    type: 'tpa_card',
    confidence: 94,
    patterns: [/\bTPA\b/i, /third\s+party\s+administrator/i, /health\s+card/i],
  },
  {
    type: 'aadhaar',
    confidence: 96,
    patterns: [/aadhaar/i, /\b\d{4}\s+\d{4}\s+\d{4}\b/],
  },
  {
    type: 'pan',
    confidence: 96,
    patterns: [/\bPAN\b/i, /\b[A-Z]{5}\d{4}[A-Z]\b/],
  },
  {
    type: 'preauth_form',
    confidence: 95,
    patterns: [/pre[-\s]?authorization/i, /cashless\s+(?:request|claim)/i, /pre[-\s]?auth/i],
  },
  {
    type: 'claim_form',
    confidence: 92,
    patterns: [/claim\s+form/i, /claimant/i, /reimbursement\s+claim/i],
  },
  {
    type: 'final_bill',
    confidence: 94,
    patterns: [/final\s+bill/i, /grand\s+total/i, /net\s+amount/i],
  },
  {
    type: 'invoice',
    confidence: 91,
    patterns: [/invoice/i, /itemi[sz]ed\s+bill/i, /bill\s+no/i, /total\s+(?:amount|charges)/i],
  },
  {
    type: 'discharge_summary',
    confidence: 95,
    patterns: [/discharge\s+summary/i, /date\s+of\s+discharge/i, /course\s+in\s+hospital/i],
  },
  {
    type: 'prescription',
    confidence: 88,
    patterns: [/prescription/i, /\bRx\b/i, /medicine\s+advised/i],
  },
  {
    type: 'lab_report',
    confidence: 90,
    patterns: [/lab(?:oratory)?\s+report/i, /pathology/i, /specimen/i, /reference\s+range/i],
  },
  {
    type: 'radiology',
    confidence: 90,
    patterns: [/radiology/i, /\bMRI\b/i, /\bCT\s+scan\b/i, /\bX[-\s]?ray\b/i, /ultrasound/i],
  },
  {
    type: 'doctor_notes',
    confidence: 84,
    patterns: [/doctor'?s?\s+notes?/i, /progress\s+notes?/i, /clinical\s+notes?/i],
  },
  {
    type: 'ub04',
    confidence: 96,
    patterns: [/\bUB[-\s]?04\b/i, /\bCMS[-\s]?1450\b/i, /revenue\s+code/i],
  },
  {
    type: 'hospital_form',
    confidence: 78,
    patterns: [/hospital/i, /admission/i, /registration/i],
  },
];

function classifyPages(pages: PageText[]): ClassifiedPage[] {
  try {
    return pages.map((page) => {
      const normalized = normalizeWhitespace(page.text.toLowerCase());

      if (!normalized || normalized.length < 20) {
        return {
          page: page.page,
          type: 'unknown',
          confidence: 0,
        };
      }

      const matches = classifiers
        .map((classifier) => {
          const hitCount = classifier.patterns.filter((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(normalized);
          }).length;
          return {
            type: classifier.type,
            score: hitCount > 0 ? classifier.confidence + hitCount * 8 : 0,
          };
        })
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = matches[0];
      return {
        page: page.page,
        type: best?.type || 'unknown',
        confidence: best ? clamp(best.score, 45, 99) : 0,
      };
    });
  } catch (error) {
    throw new PipelineError(
      'classification_failed',
      error instanceof Error ? error.message : 'Page classification failed.',
      500
    );
  }
}

function findCandidate<T>(
  pages: PageText[],
  classifications: ClassifiedPage[],
  patterns: Array<Pattern<T>>
): Candidate<T> | null {
  const candidates: Array<Candidate<T> & { priority: number }> = [];

  for (const page of pages) {
    const pageText = normalizeForEntityMatching(page.text);
    if (!pageText) continue;

    const classification =
      classifications.find((item) => item.page === page.page) ||
      ({ type: 'unknown', confidence: 0, page: page.page } satisfies ClassifiedPage);

    for (const pattern of patterns) {
      const isPreferredPageType = Boolean(
        pattern.pageTypes?.includes(classification.type)
      );
      const classificationPenalty = pattern.pageTypes && !isPreferredPageType ? 6 : 0;
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
        candidates.push({
          value,
          raw,
          page: page.page,
          docType: classification.type,
          method: page.method,
          confidence,
          priority: (pattern.confidence || 78) + pageBonus - classificationPenalty,
        });
      }
    }
  }

  return (
    candidates.sort(
      (a, b) => b.priority - a.priority || b.confidence - a.confidence || a.page - b.page
    )[0] || null
  );
}

function findAllCandidates<T>(
  pages: PageText[],
  classifications: ClassifiedPage[],
  patterns: Array<Pattern<T>>
): Candidate<T>[] {
  const all: Array<Candidate<T> & { priority: number }> = [];
  for (const page of pages) {
    const pageText = normalizeForEntityMatching(page.text);
    if (!pageText) continue;

    const classification =
      classifications.find((item) => item.page === page.page) ||
      ({ type: 'unknown', confidence: 0, page: page.page } satisfies ClassifiedPage);

    for (const pattern of patterns) {
      const isPreferredPageType = Boolean(
        pattern.pageTypes?.includes(classification.type)
      );
      const classificationPenalty = pattern.pageTypes && !isPreferredPageType ? 6 : 0;
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
          priority: (pattern.confidence || 78) + pageBonus - classificationPenalty,
        });
      }
    }
  }
  return all.sort(
    (a, b) => b.priority - a.priority || b.confidence - a.confidence || a.page - b.page
  );
}

function extractEntities(pages: PageText[], classifications: ClassifiedPage[]): ExtractedFields {
  try {
    const date = (value: string) => normalizeDate(value);
    const money = (value: string) => parseMoney(value);
    const text = (value: string) => cleanValue(value).slice(0, 240) || null;
    const identifier = (value: string) => cleanValue(value).replace(/\s+/g, '').slice(0, 64) || null;
    const diagnosisText = (value: string) => {
      const cleaned = cleanValue(value).slice(0, 180);
      if (/^[A-TV-Z][0-9][0-9AB](?:\.[A-Z0-9]{1,4})?$/i.test(cleaned)) return null;
      return cleaned || null;
    };
    const boolYesNo = (value: string) => {
      if (/^(yes|y|true|emergency)$/i.test(value.trim())) return true;
      if (/^(no|n|false|planned|elective)$/i.test(value.trim())) return false;
      return null;
    };

    const admission = findCandidate(pages, classifications, [
      {
        regex:
          /(?:date\s+of\s+(?:hospital\s+)?admission|admission\s+(?:date|dt)|admit(?:ted)?\s+(?:on|date)?|date\s+admitted|d\s*o\s*a)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4}|[A-Za-z]{3,9}\s*\d{1,2},?\s*\d{2,4})/i,
        normalize: date,
        confidence: 88,
        pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'hospital_form'],
      },
    ]);
    const discharge = findCandidate(pages, classifications, [
      {
        regex:
          /(?:date\s+of\s+discharge|discharge\s+(?:date|dt)|date\s+discharged|discharged\s+on|date\s+of\s+release|release\s+date|released\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4}|[A-Za-z]{3,9}\s*\d{1,2},?\s*\d{2,4})/i,
        normalize: date,
        confidence: 88,
        pageTypes: ['discharge_summary', 'final_bill', 'claim_form'],
      },
      {
        regex:
          /(?:d\s*o\s*d)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4}|[A-Za-z]{3,9}\s*\d{1,2},?\s*\d{2,4})/i,
        normalize: date,
        confidence: 68,
        pageTypes: ['discharge_summary', 'final_bill', 'claim_form'],
      },
    ]);
    const losFromDates = daysBetween(admission?.value, discharge?.value);

    const icdCandidates = findAllCandidates<string>(pages, classifications, [
      {
        regex: /\b([A-TV-Z][0-9][0-9AB](?:\.[A-Z0-9]{1,4})?)\b/g,
        normalize: text,
        confidence: 86,
        pageTypes: ['discharge_summary', 'claim_form', 'preauth_form', 'ub04'],
      },
    ])
      .map((candidate) => {
        const sourcePage = pages.find((page) => page.page === candidate.page);
        const sourceText = normalizeForEntityMatching(sourcePage?.text || '').toLowerCase();
        const hasClinicalContext =
          /diagnos(?:is|es)|icd(?:\s*-?\s*10)?|clinical|discharge\s+summary|provisional|final\s+diagnosis|ailment|disease/i.test(
            sourceText
          );
        const hasAdministrativeContext =
          /invoice|bill\s*no|receipt|gst|tax|policy|member|customer|uhid|authorization\s*no|reference/i.test(
            sourceText
          );
        const docTypeBonus = ['discharge_summary', 'claim_form', 'preauth_form', 'ub04'].includes(
          candidate.docType
        )
          ? 10
          : 0;
        const contextBonus = hasClinicalContext ? 14 : 0;
        const adminPenalty = hasAdministrativeContext && !hasClinicalContext ? 16 : 0;

        return {
          ...candidate,
          confidence: clamp(candidate.confidence + docTypeBonus + contextBonus - adminPenalty),
        };
      })
      .sort((a, b) => b.confidence - a.confidence || a.page - b.page);
    const uniqueIcd = Array.from(new Set(icdCandidates.map((item) => item.value))).slice(0, 12);
    const bestIcd = icdCandidates[0] || null;

    const patientFullName = findCandidate(pages, classifications, [
      {
        regex:
          /(?:patient(?:'s)?\s*name|name\s+of\s+(?:patient|insured)|insured\s+name|beneficiary\s+name)\s*[:\-]?\s*((?:mr|mrs|ms|dr)?\.?\s*[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,5})/i,
        normalize: text,
        confidence: 88,
        pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'insurance_card', 'tpa_card'],
      },
      {
        regex:
          /(?:^|\n)\s*name\s*[:\-]?\s*((?:mr|mrs|ms|dr)?\.?\s*[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,5})(?=\n|$)/im,
        normalize: text,
        confidence: 70,
        pageTypes: ['aadhaar', 'pan'],
      },
    ]);

    return {
      patient: {
        full_name: makeTrace(patientFullName, null),
        dob: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:d\.?\s*o\.?\s*b|date\s+of\s+birth|birth\s+(?:date|dt)|date\s+birth|born\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s*[A-Za-z]{3,9}\s*\d{2,4}|[A-Za-z]{3,9}\s*\d{1,2},?\s*\d{2,4})/i,
              normalize: date,
              confidence: 90,
              pageTypes: ['aadhaar', 'pan', 'claim_form', 'preauth_form', 'insurance_card'],
            },
          ]),
          null
        ),
        gender: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:gender|sex)\s*[:\-]?\s*(male|female|m|f|other|transgender)/i,
              normalize: text,
              confidence: 82,
            },
          ]),
          null
        ),
        age: makeTrace(
          findCandidate<number>(pages, classifications, [
            {
              regex: /(?:age)\s*[:\-]?\s*(\d{1,3})\b/i,
              normalize: (value) => {
                const parsed = Number.parseInt(value, 10);
                return Number.isFinite(parsed) && parsed > 0 && parsed < 125 ? parsed : null;
              },
              confidence: 82,
            },
          ]),
          null
        ),
        phone: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:phone|mobile|contact|telephone)(?:\s*(?:number|no))?\s*[:\-]?\s*(\+?\d[\d\s().-]{7,})/i,
              normalize: text,
              confidence: 82,
              pageTypes: ['claim_form', 'preauth_form', 'hospital_form'],
            },
          ]),
          null
        ),
        address: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:address)\s*[:\-]?\s*([^\n\r]{8,220})/i,
              normalize: text,
              confidence: 75,
              pageTypes: ['claim_form', 'preauth_form', 'aadhaar'],
            },
          ]),
          null
        ),
      },
      insurance: {
        provider_name: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:insurance\s*(?:company|provider|name)|insurer|payer)\s*[:\-]?\s*([^\n\r]{3,140})/i,
              normalize: text,
              confidence: 84,
              pageTypes: ['insurance_card', 'tpa_card', 'preauth_form', 'claim_form'],
            },
          ]),
          null
        ),
        tpa_name: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:TPA|third\s+party\s+administrator)\s*(?:name)?\s*[:\-]?\s*([^\n\r]{3,140})/i,
              normalize: text,
              confidence: 86,
              pageTypes: ['tpa_card', 'preauth_form', 'claim_form'],
            },
          ]),
          null
        ),
        policy_number: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:master\s+policy|group\s+policy|policy)\s*(?:number|num|no\.?|id|code|ref|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i,
              normalize: identifier,
              confidence: 90,
              pageTypes: ['insurance_card', 'tpa_card', 'preauth_form', 'claim_form'],
            },
          ]),
          null
        ),
        member_id: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:member|subscriber|insured|beneficiary|health\s*card|customer|uhid)\s*(?:id|number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i,
              normalize: identifier,
              confidence: 90,
              pageTypes: ['insurance_card', 'tpa_card', 'preauth_form', 'claim_form'],
            },
          ]),
          null
        ),
        corporate_or_group_id: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:corporate|group)\s*(?:id|number|no\.?|code|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{4,25})/i,
              normalize: identifier,
              confidence: 84,
              pageTypes: ['insurance_card', 'tpa_card', 'claim_form'],
            },
          ]),
          null
        ),
        insurance_id: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:insurance|insured)\s*(?:member\s*)?(?:id|number|no\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\s/-]{5,30})/i,
              normalize: identifier,
              confidence: 84,
              pageTypes: ['insurance_card', 'tpa_card', 'claim_form'],
            },
          ]),
          null
        ),
      },
      hospital: {
        facility_name: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:hospital|facility|provider)\s*(?:name)?\s*[:\-]?\s*([^\n\r]{3,140})/i,
              normalize: text,
              confidence: 84,
              pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'invoice', 'final_bill'],
            },
            {
              regex: /([A-Z][A-Za-z&.' -]+(?:Hospital|Medical Center|Clinic|Healthcare)[^\n\r]{0,80})/i,
              normalize: text,
              confidence: 78,
            },
          ]),
          null
        ),
        doctor_name: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:treating|attending|consulting)?\s*(?:doctor|physician|consultant)\s*[:\-]?\s*(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})/i,
              normalize: text,
              confidence: 86,
              pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'doctor_notes'],
            },
            {
              regex: /\b(Dr\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})\b/i,
              normalize: text,
              confidence: 74,
            },
          ]),
          null
        ),
        registration_number: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:registration|reg\.?|license)\s*(?:number|no|#)?\s*[:\-]?\s*([A-Z0-9/-]{4,})/i,
              normalize: text,
              confidence: 78,
              pageTypes: ['hospital_form', 'preauth_form', 'discharge_summary'],
            },
          ]),
          null
        ),
        admission_date: makeTrace(admission, null),
        discharge_date: makeTrace(discharge, null),
      },
      clinical: {
        diagnosis: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:principal|primary|final|clinical|provisional)?\s*diagnosis\s*[:\-]?\s*([^\n\r]{3,180})/i,
              normalize: diagnosisText,
              confidence: 88,
              pageTypes: ['discharge_summary', 'preauth_form', 'claim_form', 'ub04'],
            },
            {
              regex:
                /(?:principal|primary|final|clinical|provisional)?\s*diagnosis\s*code\s*[:\-]?\s*([^\n\r]{3,180})/i,
              normalize: diagnosisText,
              confidence: 72,
              pageTypes: ['discharge_summary', 'preauth_form', 'claim_form', 'ub04'],
            },
            {
              regex: /\b[A-TV-Z][0-9][0-9AB](?:\.[A-Z0-9]{1,4})?\s*(?:[-:()]|\s)\s*([^\n\r]{3,140})/gi,
              normalize: diagnosisText,
              confidence: 82,
              pageTypes: ['discharge_summary', 'ub04'],
            },
          ]),
          null
        ),
        icd10_codes: makeTrace(
          bestIcd
            ? {
                ...bestIcd,
                value: uniqueIcd,
                confidence: clamp(bestIcd.confidence + Math.min(10, uniqueIcd.length * 2)),
              }
            : null,
          []
        ),
        symptoms: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:symptoms?|chief\s+complaints?|presenting\s+complaints?)\s*[:\-]?\s*([^\n\r]{3,220})/i,
              normalize: text,
              confidence: 80,
              pageTypes: ['preauth_form', 'discharge_summary', 'doctor_notes'],
            },
          ]),
          null
        ),
        surgery: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:surgery|operation)\s*[:\-]?\s*([^\n\r]{3,180})/i,
              normalize: text,
              confidence: 82,
              pageTypes: ['preauth_form', 'discharge_summary', 'final_bill'],
            },
          ]),
          null
        ),
        procedure: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:procedure|treatment|proposed\s+treatment|planned\s+procedure)\s*[:\-]?\s*([^\n\r]{3,180})/i,
              normalize: text,
              confidence: 84,
              pageTypes: ['preauth_form', 'claim_form', 'discharge_summary', 'ub04'],
            },
          ]),
          null
        ),
        length_of_stay: makeTrace(
          findCandidate<number>(pages, classifications, [
            {
              regex: /(?:length\s+of\s+stay|LOS|stay)\s*[:\-]?\s*(\d{1,3})\s*(?:days?|d)?/i,
              normalize: (value) => {
                const parsed = Number.parseInt(value, 10);
                return Number.isFinite(parsed) && parsed > 0 && parsed < 365 ? parsed : null;
              },
              confidence: 80,
              pageTypes: ['preauth_form', 'claim_form', 'discharge_summary'],
            },
          ]) ||
            (losFromDates !== null && admission
              ? {
                  value: losFromDates,
                  confidence: 82,
                  page: admission.page,
                  docType: admission.docType,
                  method: admission.method,
                  raw: String(losFromDates),
                }
              : null),
          null
        ),
        emergency_case: makeTrace(
          findCandidate<boolean>(pages, classifications, [
            {
              regex: /(?:emergency)\s*[:\-]?\s*(yes|no|y|n|true|false)/i,
              normalize: boolYesNo,
              confidence: 82,
              pageTypes: ['preauth_form', 'claim_form', 'hospital_form'],
            },
            {
              regex: /\b(emergency)\b/i,
              normalize: boolYesNo,
              confidence: 62,
            },
            {
              regex: /\b(planned|elective)\b/i,
              normalize: boolYesNo,
              confidence: 62,
            },
          ]),
          null
        ),
      },
      financial: {
        room_rent: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:room\s*rent|room\s*charges?)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 84,
              pageTypes: ['invoice', 'final_bill', 'preauth_form'],
            },
          ]),
          null
        ),
        icu_charges: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:ICU|intensive\s+care)\s*(?:charges?|rent)?\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 84,
              pageTypes: ['invoice', 'final_bill', 'preauth_form'],
            },
          ]),
          null
        ),
        ot_charges: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:OT|operation\s*theatre|operating\s*room)\s*(?:charges?)?\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 84,
              pageTypes: ['invoice', 'final_bill', 'preauth_form'],
            },
          ]),
          null
        ),
        medicine: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:medicine|medicines|drugs)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 78,
              pageTypes: ['invoice', 'final_bill', 'prescription'],
            },
          ]),
          null
        ),
        pharmacy: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex: /(?:pharmacy|consumables)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 78,
              pageTypes: ['invoice', 'final_bill'],
            },
          ]),
          null
        ),
        investigations: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:investigations?|diagnostics?|laboratory|radiology)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 78,
              pageTypes: ['invoice', 'final_bill', 'lab_report', 'radiology'],
            },
          ]),
          null
        ),
        professional_fees: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:professional|doctor|surgeon|consultation)\s*(?:fees?|charges?)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 80,
              pageTypes: ['invoice', 'final_bill'],
            },
          ]),
          null
        ),
        final_bill: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:final\s+bill|grand\s+total|net\s+amount|total\s+bill)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 88,
              pageTypes: ['final_bill', 'invoice'],
            },
          ]),
          null
        ),
        total_claimed: makeTrace(
          findCandidate(pages, classifications, [
            {
              regex:
                /(?:total\s+claimed|claim\s+amount|amount\s+claimed|total\s+claim)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
              normalize: money,
              confidence: 86,
              pageTypes: ['claim_form', 'preauth_form', 'final_bill', 'invoice'],
            },
          ]),
          null
        ),
      },
      authorization: {
        patient_signature: makeTrace(
          findCandidate<boolean>(pages, classifications, [
            {
              regex: /(?:patient|insured|claimant)[\s\S]{0,80}(signature|signed|e-signed)/i,
              normalize: () => true,
              confidence: 72,
              pageTypes: ['claim_form', 'preauth_form', 'discharge_summary'],
            },
          ]),
          null
        ),
        doctor_signature: makeTrace(
          findCandidate<boolean>(pages, classifications, [
            {
              regex: /(?:doctor|physician|consultant)[\s\S]{0,80}(signature|signed|e-signed)/i,
              normalize: () => true,
              confidence: 72,
              pageTypes: ['preauth_form', 'discharge_summary', 'doctor_notes'],
            },
          ]),
          null
        ),
        hospital_seal: makeTrace(
          findCandidate<boolean>(pages, classifications, [
            {
              regex: /(hospital\s+(?:seal|stamp)|official\s+seal)/i,
              normalize: () => true,
              confidence: 72,
              pageTypes: ['claim_form', 'preauth_form', 'discharge_summary', 'final_bill'],
            },
          ]),
          null
        ),
        approval_stamp: makeTrace(
          findCandidate<boolean>(pages, classifications, [
            {
              regex: /(approved|approval\s+(?:stamp|seal|code)|authorized)/i,
              normalize: () => true,
              confidence: 70,
              pageTypes: ['preauth_form', 'claim_form'],
            },
          ]),
          null
        ),
      },
    };
  } catch (error) {
    throw new PipelineError(
      'entity_extraction_failed',
      error instanceof Error ? error.message : 'Entity extraction failed.',
      500
    );
  }
}

function fieldPage(...fields: TraceableField<unknown>[]) {
  return fields.map((field) => field.source_page).filter((page): page is number => Boolean(page));
}

function addIssue(
  issues: ValidationError[],
  issue: Omit<ValidationError, 'source_pages'> & { source_pages?: number[] }
) {
  issues.push({ ...issue, source_pages: Array.from(new Set(issue.source_pages || [])) });
}

function validateClaim(
  fields: ExtractedFields,
  pages: PageText[],
  classifications: ClassifiedPage[],
  ocrConfidence: number
): ValidationError[] {
  try {
    const issues: ValidationError[] = [];
    const types = new Set(classifications.map((page) => page.type));
    const pageText = pages.map((page) => page.text).join('\n');

    const nameCandidates = findAllCandidates<string>(pages, classifications, [
      {
        regex:
          /(?:patient(?:'s)?\s*name|name\s+of\s+(?:patient|insured)|insured\s+name|beneficiary\s+name)\s*[:\-]?\s*((?:mr|mrs|ms|dr)?\.?\s*[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,5})/gi,
        normalize: (value) => cleanValue(value),
        confidence: 80,
      },
    ]).filter((item) => normalizeName(item.value).length > 3);
    const uniqueNames = Array.from(new Map(nameCandidates.map((item) => [normalizeName(item.value), item])).values());
    if (uniqueNames.length > 1) {
      addIssue(issues, {
        id: 'identity.patient_mismatch',
        category: 'identity',
        severity: 'critical',
        issue: 'Patient name differs across packet documents',
        evidence: uniqueNames.map((item) => `${item.value} on page ${item.page}`).join('; '),
        source_pages: uniqueNames.map((item) => item.page),
        fields: ['patient.full_name'],
      });
    }

    if (!hasValue(fields.patient.full_name)) {
      addIssue(issues, {
        id: 'identity.missing_patient_name',
        category: 'identity',
        severity: 'critical',
        issue: 'Missing patient full name',
        evidence: 'No patient, insured, or beneficiary name label was extracted.',
        fields: ['patient.full_name'],
      });
    }

    if (!hasValue(fields.patient.dob) && !hasValue(fields.patient.age)) {
      addIssue(issues, {
        id: 'identity.missing_dob_or_age',
        category: 'identity',
        severity: 'high',
        issue: 'Missing DOB or age',
        evidence: 'No DOB, date of birth, birth date, or age value was extracted.',
        fields: ['patient.dob', 'patient.age'],
      });
    }

    if (
      !hasValue(fields.insurance.policy_number) &&
      !hasValue(fields.insurance.member_id) &&
      !hasValue(fields.insurance.insurance_id)
    ) {
      addIssue(issues, {
        id: 'insurance.missing_policy_or_member_id',
        category: 'insurance',
        severity: 'critical',
        issue: 'Missing policy number or member ID',
        evidence: 'No policy, member, subscriber, health card, or insurance ID pattern was extracted.',
        fields: ['insurance.policy_number', 'insurance.member_id', 'insurance.insurance_id'],
      });
    }

    const memberOrPolicy =
      fields.insurance.member_id.value ||
      fields.insurance.policy_number.value ||
      fields.insurance.insurance_id.value;
    if (memberOrPolicy && String(memberOrPolicy).replace(/[^A-Z0-9]/gi, '').length < 6) {
      addIssue(issues, {
        id: 'insurance.invalid_member_id',
        category: 'insurance',
        severity: 'high',
        issue: 'Insurance identifier appears incomplete',
        evidence: `Extracted identifier "${memberOrPolicy}" is shorter than expected.`,
        source_pages: fieldPage(
          fields.insurance.member_id,
          fields.insurance.policy_number,
          fields.insurance.insurance_id
        ),
        fields: ['insurance.member_id', 'insurance.policy_number', 'insurance.insurance_id'],
      });
    }

    if (!hasValue(fields.clinical.diagnosis)) {
      addIssue(issues, {
        id: 'clinical.missing_diagnosis',
        category: 'clinical',
        severity: 'critical',
        issue: 'Missing diagnosis',
        evidence: 'No diagnosis label or diagnosis description was extracted from clinical pages.',
        fields: ['clinical.diagnosis'],
      });
    }

    if (!hasValue(fields.clinical.icd10_codes)) {
      addIssue(issues, {
        id: 'clinical.missing_icd10',
        category: 'clinical',
        severity: 'high',
        issue: 'Missing ICD-10 code',
        evidence: 'No valid ICD-10 code pattern was extracted.',
        fields: ['clinical.icd10_codes'],
      });
    }

    const los = fields.clinical.length_of_stay.value;
    const computedLos = daysBetween(fields.hospital.admission_date.value, fields.hospital.discharge_date.value);
    if (fields.hospital.admission_date.value && fields.hospital.discharge_date.value && computedLos !== null && computedLos <= 0) {
      addIssue(issues, {
        id: 'clinical.discharge_before_admission',
        category: 'clinical',
        severity: 'critical',
        issue: 'Discharge date is before admission date',
        evidence: `Admission ${fields.hospital.admission_date.value}, discharge ${fields.hospital.discharge_date.value}.`,
        source_pages: fieldPage(fields.hospital.admission_date, fields.hospital.discharge_date),
        fields: ['hospital.admission_date', 'hospital.discharge_date'],
      });
    }

    if (los !== null && (los < 1 || los > 365)) {
      addIssue(issues, {
        id: 'clinical.invalid_los',
        category: 'clinical',
        severity: 'medium',
        issue: 'Invalid length of stay',
        evidence: `Extracted length of stay is ${los} days.`,
        source_pages: fieldPage(fields.clinical.length_of_stay),
        fields: ['clinical.length_of_stay'],
      });
    }

    if (!types.has('discharge_summary') && !hasValue(fields.hospital.discharge_date)) {
      addIssue(issues, {
        id: 'document.missing_discharge_summary',
        category: 'document',
        severity: 'high',
        issue: 'Missing discharge summary evidence',
        evidence: 'No page was classified as discharge summary and no discharge date was extracted.',
        fields: ['hospital.discharge_date'],
      });
    }

    if (!types.has('preauth_form') && /cashless|pre.?auth|authorization/i.test(pageText)) {
      addIssue(issues, {
        id: 'document.preauth_unclear',
        category: 'document',
        severity: 'medium',
        issue: 'Pre-authorization page could not be clearly classified',
        evidence: 'Authorization terms were seen, but no page met the pre-authorization classifier threshold.',
        fields: [],
      });
    }

    if (!types.has('invoice') && !types.has('final_bill') && !hasValue(fields.financial.final_bill)) {
      addIssue(issues, {
        id: 'financial.missing_final_bill',
        category: 'financial',
        severity: 'critical',
        issue: 'Missing final bill or invoice total',
        evidence: 'No invoice/final bill page was classified and no final bill amount was extracted.',
        fields: ['financial.final_bill', 'financial.total_claimed'],
      });
    }

    const totalClaimed = fields.financial.total_claimed.value;
    const finalBill = fields.financial.final_bill.value;
    if (totalClaimed && finalBill && Math.abs(totalClaimed - finalBill) > Math.max(100, finalBill * 0.02)) {
      addIssue(issues, {
        id: 'financial.claim_total_mismatch',
        category: 'financial',
        severity: 'high',
        issue: 'Claimed amount does not match final bill',
        evidence: `Total claimed ${formatMoney(totalClaimed)}, final bill ${formatMoney(finalBill)}.`,
        source_pages: fieldPage(fields.financial.total_claimed, fields.financial.final_bill),
        fields: ['financial.total_claimed', 'financial.final_bill'],
      });
    }

    const lineItems = [
      fields.financial.room_rent.value,
      fields.financial.icu_charges.value,
      fields.financial.ot_charges.value,
      fields.financial.medicine.value,
      fields.financial.pharmacy.value,
      fields.financial.investigations.value,
      fields.financial.professional_fees.value,
    ].filter((value): value is number => typeof value === 'number' && value > 0);
    const lineTotal = lineItems.reduce((sum, value) => sum + value, 0);
    if (lineItems.length >= 3 && finalBill && Math.abs(lineTotal - finalBill) > Math.max(100, finalBill * 0.05)) {
      addIssue(issues, {
        id: 'financial.line_items_mismatch',
        category: 'financial',
        severity: 'high',
        issue: 'Extracted bill line items do not reconcile to final bill',
        evidence: `Line items sum to ${formatMoney(lineTotal)}, final bill is ${formatMoney(finalBill)}.`,
        fields: [
          'financial.room_rent',
          'financial.icu_charges',
          'financial.ot_charges',
          'financial.medicine',
          'financial.pharmacy',
          'financial.investigations',
          'financial.professional_fees',
          'financial.final_bill',
        ],
      });
    }

    if (fields.authorization.patient_signature.value !== true) {
      addIssue(issues, {
        id: 'authorization.missing_patient_signature',
        category: 'authorization',
        severity: 'high',
        issue: 'Missing patient signature evidence',
        evidence: 'No patient, insured, or claimant signature marker was extracted.',
        fields: ['authorization.patient_signature'],
      });
    }

    if (fields.authorization.doctor_signature.value !== true) {
      addIssue(issues, {
        id: 'authorization.missing_doctor_signature',
        category: 'authorization',
        severity: 'high',
        issue: 'Missing doctor signature evidence',
        evidence: 'No doctor, physician, or consultant signature marker was extracted.',
        fields: ['authorization.doctor_signature'],
      });
    }

    if (fields.authorization.hospital_seal.value !== true) {
      addIssue(issues, {
        id: 'authorization.missing_hospital_seal',
        category: 'authorization',
        severity: 'medium',
        issue: 'Missing hospital seal or stamp evidence',
        evidence: 'No hospital seal, stamp, or official seal marker was extracted.',
        fields: ['authorization.hospital_seal'],
      });
    }

    const fingerprints = new Map<string, number[]>();
    for (const page of pages) {
      const key = textFingerprint(page.text);
      if (key.length < 120) continue;
      fingerprints.set(key, [...(fingerprints.get(key) || []), page.page]);
    }
    const duplicates = Array.from(fingerprints.values()).filter((items) => items.length > 1);
    for (const duplicatePages of duplicates) {
      addIssue(issues, {
        id: `document.duplicate_pages.${duplicatePages.join('_')}`,
        category: 'document',
        severity: 'medium',
        issue: 'Possible duplicate packet pages',
        evidence: `Pages ${duplicatePages.join(', ')} have highly similar extracted text.`,
        source_pages: duplicatePages,
        fields: [],
      });
    }

    if (ocrConfidence > 0 && ocrConfidence < 58) {
      addIssue(issues, {
        id: 'document.poor_ocr_quality',
        category: 'document',
        severity: 'high',
        issue: 'Poor OCR quality',
        evidence: `Average OCR confidence was ${ocrConfidence}%.`,
        fields: [],
      });
    }

    const unknownPages = classifications.filter((page) => page.type === 'unknown' && page.confidence === 0);
    if (unknownPages.length > 0 && unknownPages.length === classifications.length) {
      addIssue(issues, {
        id: 'document.unreadable_packet',
        category: 'document',
        severity: 'critical',
        issue: 'Packet text is unreadable',
        evidence: 'No pages had enough extractable text for classification.',
        source_pages: unknownPages.map((page) => page.page),
        fields: [],
      });
    }

    return issues;
  } catch (error) {
    throw new PipelineError(
      'validation_failed',
      error instanceof Error ? error.message : 'Claim validation failed.',
      500
    );
  }
}

function scoreClaim(fields: ExtractedFields, issues: ValidationError[], pages: PageText[]) {
  const extracted = [
    fields.patient.full_name,
    fields.patient.dob,
    fields.insurance.policy_number,
    fields.insurance.member_id,
    fields.hospital.facility_name,
    fields.hospital.admission_date,
    fields.hospital.discharge_date,
    fields.clinical.diagnosis,
    fields.clinical.icd10_codes,
    fields.financial.final_bill,
    fields.financial.total_claimed,
  ];
  const extractionCoverage =
    extracted.length === 0
      ? 0
      : (extracted.filter((field) => hasValue(field)).length / extracted.length) * 100;
  const avgFieldConfidence = extracted
    .filter((field) => hasValue(field))
    .reduce((sum, field, _index, values) => sum + field.confidence / values.length, 0);
  const avgTextConfidence =
    pages.length === 0
      ? 0
      : pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length;
  const penalty = issues.reduce((sum, issue) => sum + severityWeight(issue.severity), 0);
  const readiness = clamp(100 - penalty - Math.max(0, 70 - extractionCoverage) * 0.35);
  const claimHealth = clamp(readiness * 0.55 + extractionCoverage * 0.25 + avgFieldConfidence * 0.2);
  const rejectionRisk: RejectionRisk =
    issues.some((issue) => issue.severity === 'critical') || readiness < 55
      ? 'high'
      : issues.some((issue) => issue.severity === 'high') || readiness < 82
        ? 'medium'
        : 'low';

  return {
    claimHealth,
    readiness,
    ocrConfidence: clamp(avgTextConfidence),
    rejectionRisk,
  };
}

function buildRepairSuggestions(issues: ValidationError[]): RepairSuggestion[] {
  return issues.map((issue) => ({
    severity: issue.severity,
    issue: issue.issue,
    impact:
      issue.severity === 'critical'
        ? 'High rejection probability'
        : issue.severity === 'high'
          ? 'Likely manual review or payer rejection'
          : issue.severity === 'medium'
            ? 'May delay adjudication'
            : 'Low impact cleanup',
    fix: repairFix(issue),
  }));
}

function repairFix(issue: ValidationError) {
  if (issue.id.includes('missing_icd10')) return 'Attach discharge coding page or add the ICD-10 code from the discharge summary.';
  if (issue.id.includes('missing_diagnosis')) return 'Attach the diagnosis/discharge summary page or enter the principal diagnosis.';
  if (issue.id.includes('missing_final_bill')) return 'Attach the final bill or itemized invoice with a visible grand total.';
  if (issue.id.includes('missing_policy')) return 'Attach insurance/TPA card or update the policy/member ID before submission.';
  if (issue.id.includes('signature')) return 'Upload the signed authorization/discharge page or request a corrected signature page.';
  if (issue.id.includes('hospital_seal')) return 'Attach a stamped hospital page or request an official seal on the bill/discharge summary.';
  if (issue.id.includes('mismatch')) return 'Reconcile the conflicting values and replace the incorrect page in the packet.';
  if (issue.id.includes('ocr') || issue.id.includes('unreadable')) return 'Rescan the affected pages at 300 DPI or upload a text-layer PDF.';
  return 'Review the cited source pages and attach a corrected supporting document.';
}

function buildUiFields(fields: ExtractedFields): UiClaimField[] {
  const asString = (field: TraceableField<string | number | boolean | string[] | null>) => {
    if (field.value === null || field.value === undefined) return '';
    if (Array.isArray(field.value)) return field.value.join(', ');
    if (typeof field.value === 'number') return formatMoney(field.value) || String(field.value);
    return String(field.value);
  };
  const source = (field: TraceableField<unknown>) =>
    field.source_doc_type ? `${field.source_doc_type} PDF extraction` : 'No source page extracted';
  const firstValue = (
    ...candidates: Array<TraceableField<string | number | boolean | string[] | null>>
  ) => candidates.find((field) => hasValue(field)) || candidates[0];
  const toUi = (
    id: UiClaimField['id'],
    label: string,
    field: TraceableField<string | number | boolean | string[] | null>
  ): UiClaimField => ({
    id,
    label,
    value: asString(field),
    confidence: hasValue(field) ? field.confidence : 0,
    source: source(field),
    sourcePage: field.source_page,
    sourceDocType: field.source_doc_type || undefined,
    method: field.method || undefined,
  });

  return [
    toUi('patientName', 'Patient name', fields.patient.full_name),
    toUi(
      'insuranceNumber',
      'Insurance number',
      firstValue(
        fields.insurance.member_id,
        fields.insurance.policy_number,
        fields.insurance.insurance_id,
        fields.insurance.corporate_or_group_id
      )
    ),
    toUi('diagnosis', 'Diagnosis', firstValue(fields.clinical.diagnosis, fields.clinical.icd10_codes)),
    toUi('doctorName', 'Attending physician', fields.hospital.doctor_name),
    toUi('hospital', 'Hospital / Facility', fields.hospital.facility_name),
    toUi('procedure', 'Procedure', firstValue(fields.clinical.procedure, fields.clinical.surgery)),
    toUi(
      'invoiceTotal',
      'Invoice total',
      firstValue(fields.financial.final_bill, fields.financial.total_claimed)
    ),
    {
      id: 'claimType',
      label: 'Claim metadata',
      value: fields.clinical.emergency_case.value === true ? 'Emergency inpatient claim' : 'Medical claim packet',
      confidence: 70,
      source: 'Claim packet context',
    },
  ];
}

function buildUiValidation(
  response: V2Response,
  pages: PageText[],
  filename: string
): UiValidationReport {
  const groups = new Map<PageDocType, ClassifiedPage[]>();
  for (const page of response.classifiedPages) {
    groups.set(page.type, [...(groups.get(page.type) || []), page]);
  }
  const title = (type: PageDocType) =>
    type
      .split('_')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  const criticalOrHigh = response.validationErrors.some(
    (issue) => issue.severity === 'critical' || issue.severity === 'high'
  );

  return {
    documentGroups: Array.from(groups.entries()).map(([type, items]) => ({
      id: type,
      title: title(type),
      pages: `Pages ${items.map((item) => item.page).join(', ')}`,
      confidence: clamp(items.reduce((sum, item) => sum + item.confidence, 0) / items.length),
      status: type === 'unknown' ? 'Needs review' : 'Classified',
      summary: `${items.length} page${items.length === 1 ? '' : 's'} classified as ${title(type).toLowerCase()}.`,
      tone: type === 'unknown' ? 'warning' : 'success',
    })),
    metrics: [
      {
        id: 'health',
        label: 'Claim Health',
        value: String(response.claimHealth),
        unit: '/100',
        color:
          response.claimHealth >= 85
            ? 'text-success'
            : response.claimHealth >= 65
              ? 'text-warning'
              : 'text-danger',
        helper: response.validationErrors.length
          ? `${response.validationErrors.length} issue${response.validationErrors.length === 1 ? '' : 's'} found`
          : 'No blockers found',
      },
      {
        id: 'readiness',
        label: 'Readiness',
        value: String(response.readiness),
        unit: '%',
        color:
          response.readiness >= 85
            ? 'text-success'
            : response.readiness >= 65
              ? 'text-warning'
              : 'text-danger',
        helper: response.readiness >= 85 ? 'Ready for final review' : 'Repairs needed first',
      },
      {
        id: 'ocr',
        label: 'OCR Confidence',
        value: String(response.ocrConfidence),
        unit: '%',
        color:
          response.ocrConfidence >= 85
            ? 'text-success'
            : response.ocrConfidence >= 60
              ? 'text-warning'
              : 'text-danger',
        helper:
          response.extractionMethod === 'pdf_text'
            ? 'Text layer extraction'
            : response.extractionMethod === 'pdf_text_only'
              ? response.ocrSkippedReason || 'Text-only fallback'
            : response.extractionMethod === 'ocr'
              ? 'OCR fallback used'
              : 'Mixed extraction',
      },
      {
        id: 'risk',
        label: 'Rejection Risk',
        value: response.rejectionRisk[0].toUpperCase() + response.rejectionRisk.slice(1),
        unit: '',
        color:
          response.rejectionRisk === 'low'
            ? 'text-success'
            : response.rejectionRisk === 'high'
              ? 'text-danger'
              : 'text-warning',
        helper: criticalOrHigh ? 'Likely payer review' : 'Based on extracted evidence',
      },
    ],
    issues: response.validationErrors.map((issue) => ({
      id: issue.id,
      severity: uiSeverity(issue.severity),
      confidence: 90,
      title: issue.issue,
      reference: issue.category,
      fix: repairFix(issue),
      evidence: issue.evidence,
    })),
    timeline: [
      { id: 'uploaded', label: 'Claim Uploaded', time: response.intake.uploadedAt, done: true },
      {
        id: 'parsed',
        label: response.pdfType === 'text_layer' ? 'PDF Text Parsed' : 'OCR Fallback Evaluated',
        time: response.intake.uploadedAt,
        done: true,
      },
      { id: 'classified', label: 'Pages Classified', time: response.intake.uploadedAt, done: true },
      { id: 'extracted', label: 'Entities Extracted', time: response.intake.uploadedAt, done: true },
      { id: 'validated', label: 'Cross-Document Validation Complete', time: response.intake.uploadedAt, done: true },
      {
        id: 'ready',
        label: 'Submission Ready',
        time: response.readiness >= 85 ? response.intake.uploadedAt : 'Pending repairs',
        done: response.readiness >= 85,
      },
    ],
    pdfStructure: [
      `01 Source packet: ${filename}`,
      `02 Page count: ${response.pageCount}`,
      `03 Extraction: ${response.extractionMethod}`,
      ...(response.ocrSkippedReason ? [`03a OCR skipped: ${response.ocrSkippedReason}`] : []),
      `04 Validation issues: ${response.validationErrors.length}`,
      `05 Readiness: ${response.readiness}%`,
    ],
    summary:
      response.validationErrors.length === 0
        ? `Parsed ${pages.length} pages and found no major claim blockers in the uploaded packet.`
        : `Parsed ${pages.length} pages and found ${response.validationErrors.length} claim-specific issue${response.validationErrors.length === 1 ? '' : 's'} from the uploaded packet.`,
    readinessScore: response.readiness,
    healthScore: response.claimHealth,
    ocrConfidence: response.ocrConfidence,
    source: 'local_analysis',
    extractionMethod:
      response.extractionMethod === 'ocr'
        ? 'ai_ocr'
        : response.extractionMethod === 'metadata_only'
          ? 'ocr_required'
          : 'pdf_text',
  };
}

function buildClaimAudit(response: V2Response) {
  const f = response.extractedFields;
  const trace = <T,>(field: TraceableField<T>) => ({
    value: field.value,
    confidence: field.confidence,
    source_page: field.source_page,
    source_doc_type: field.source_doc_type || undefined,
    method: field.method || undefined,
  });

  return {
    document_metadata: {
      document_type: 'Medical claim packet',
      page_count: response.pageCount,
      scan_quality:
        response.ocrConfidence >= 85 ? 'Excellent' : response.ocrConfidence >= 58 ? 'Legible' : 'Poor/Blurry',
    },
    page_classifications: response.classifiedPages.map((page) => ({
      page_number: page.page,
      document_type: page.type,
      confidence: page.confidence,
    })),
    extracted_data: {
      patient: {
        full_name: trace(f.patient.full_name),
        dob: trace(f.patient.dob),
        gender: trace(f.patient.gender),
        contact_number: trace(f.patient.phone),
      },
      insurance: {
        tpa_or_provider_name: trace(
          f.insurance.tpa_name.value ? f.insurance.tpa_name : f.insurance.provider_name
        ),
        policy_number: trace(f.insurance.policy_number),
        corporate_or_group_id: trace(f.insurance.corporate_or_group_id),
        member_id: trace(f.insurance.member_id),
      },
      hospital: {
        facility_name: trace(f.hospital.facility_name),
        treating_doctor: trace(f.hospital.doctor_name),
        hospital_registration_no: trace(f.hospital.registration_number),
      },
      clinical: {
        admission_date: trace(f.hospital.admission_date),
        discharge_date: trace(f.hospital.discharge_date),
        is_emergency: trace(f.clinical.emergency_case),
        presenting_complaints: trace(f.clinical.symptoms),
        diagnosis: trace(f.clinical.diagnosis),
        icd_10_codes: trace(f.clinical.icd10_codes),
        proposed_treatment: trace(
          f.clinical.procedure.value ? f.clinical.procedure : f.clinical.surgery
        ),
      },
      financial: {
        expected_total_cost: trace(
          f.financial.total_claimed.value ? f.financial.total_claimed : f.financial.final_bill
        ),
        room_rent: trace(f.financial.room_rent),
        icu_charges: trace(f.financial.icu_charges),
        ot_charges: trace(f.financial.ot_charges),
        professional_fees: trace(f.financial.professional_fees),
      },
      signatures: {
        patient_signature_present: trace({
          ...f.authorization.patient_signature,
          value: f.authorization.patient_signature.value === true,
        }),
        doctor_signature_present: trace({
          ...f.authorization.doctor_signature,
          value: f.authorization.doctor_signature.value === true,
        }),
        hospital_seal_present: trace({
          ...f.authorization.hospital_seal,
          value: f.authorization.hospital_seal.value === true,
        }),
      },
    },
    validation_errors: response.validationErrors.map((issue) => issue.issue),
  };
}

function buildConfirmedData(response: V2Response) {
  const f = response.extractedFields;
  const finalAmount = f.financial.total_claimed.value || f.financial.final_bill.value;
  return {
    patient: {
      full_name: f.patient.full_name.value || '',
      date_of_birth: f.patient.dob.value || '',
      gender: f.patient.gender.value || '',
      address: f.patient.address.value || '',
      contact_phone: f.patient.phone.value || '',
      contact_email: '',
    },
    insurance: {
      policyholder_name: f.patient.full_name.value || '',
      group_number: f.insurance.corporate_or_group_id.value || '',
      member_id: f.insurance.member_id.value || f.insurance.policy_number.value || '',
      payer_id: f.insurance.insurance_id.value || '',
      plan_name: f.insurance.tpa_name.value || f.insurance.provider_name.value || '',
    },
    pre_authorization: {
      approval_code: '',
      authorized_from: '',
      authorized_to: '',
    },
    clinical: {
      admission_date: f.hospital.admission_date.value || '',
      discharge_date: f.hospital.discharge_date.value || '',
      attending_physician: f.hospital.doctor_name.value || '',
      hospital_npi: '',
      hospital_tax_id: f.hospital.registration_number.value || '',
      facility_name: f.hospital.facility_name.value || '',
      principal_diagnosis: f.clinical.diagnosis.value || '',
    },
    coding: {
      icd10_codes: f.clinical.icd10_codes.value.map((code) => ({
        code,
        description: '',
        confidence: f.clinical.icd10_codes.confidence / 100,
      })),
      cpt_codes: [],
    },
    billing: {
      total_billed_amount: finalAmount ? String(Math.round(finalAmount)) : '',
      line_items: [],
    },
    extraction_meta: {
      overall_confidence: response.ocrConfidence,
      low_confidence_fields: [],
      requires_manual_review: response.validationErrors.length > 0,
    },
  };
}

function jsonPipelineError(error: PipelineError, session?: Partial<ClaimSession>) {
  const body: PipelineErrorBody = {
    success: false,
    stage: error.stage,
    error: error.message,
    claimId: session?.claimId,
    uploadSessionId: session?.uploadSessionId,
  };
  return NextResponse.json(body, statusFor(error.status));
}

export async function POST(req: Request) {
  let session: Partial<ClaimSession> | undefined;

  try {
    const { user, response: authResponse } = await requireUser();
    if (authResponse) return authResponse;

    const formData = await req.formData().catch(() => {
      throw new PipelineError('upload_parse_failed', 'Upload form data could not be parsed.', 400);
    });
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new PipelineError('upload_parse_failed', 'A PDF claim packet is required.', 400);
    }

    if (file.size <= 0) {
      throw new PipelineError('upload_parse_failed', 'The uploaded PDF is empty.', 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new PipelineError(
        'upload_parse_failed',
        `The uploaded PDF exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
        413
      );
    }

    const mimeType = file.type || 'application/octet-stream';
    if (mimeType !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new PipelineError('upload_parse_failed', 'Only PDF claim packets are supported.', 415);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
      throw new PipelineError('pdf_parse_failed', 'The uploaded file is not a valid PDF.', 422);
    }

    const claimId = createId('CLM');
    const uploadSessionId = createId('UPL');
    const uploadedAt = new Date().toISOString();
    const pageCount = countPdfPages(buffer);

    session = {
      claimId,
      uploadSessionId,
      filename: file.name,
      mimeType,
      fileSize: file.size,
      pageCount,
      uploadedAt,
    };

    const textExtraction = await extractPdfTextFirst(buffer, pageCount);
    const usefulTextLength = textExtraction.pages.reduce((sum, page) => sum + page.text.length, 0);
    const textPageCount = textExtraction.pages.filter((page) => page.text.length >= TEXT_PAGE_THRESHOLD).length;
    const pdfType: PdfKind =
      usefulTextLength >= TEXT_PACKET_THRESHOLD || textPageCount > 0 ? 'text_layer' : 'scanned_or_image';

    let pages = textExtraction.pages;
    let extractionMethod: ExtractionMethod = 'pdf_text';
    let ocrSkippedReason: string | undefined;
    const weakPages = textExtraction.pages.some((page) => page.text.length < TEXT_PAGE_THRESHOLD);

    if (pdfType === 'scanned_or_image' || weakPages) {
      try {
        const ocrPages = await runOcrFallback(buffer, pageCount);
        pages = textExtraction.pages.map((pdfPage) => {
          const ocrPage = ocrPages.find((page) => page.page === pdfPage.page);
          if (!ocrPage) return pdfPage;
          return ocrPage.text.length > pdfPage.text.length ? ocrPage : pdfPage;
        });
        const hasOcrPages = pages.some((page) => page.method === 'ocr');
        extractionMethod = hasOcrPages
          ? pdfType === 'text_layer'
            ? 'mixed'
            : 'ocr'
          : usefulTextLength > 0
            ? 'pdf_text_only'
            : 'metadata_only';
        if (!hasOcrPages) {
          ocrSkippedReason = 'ocr_no_usable_text';
        }
      } catch (error) {
        const pipelineError =
          error instanceof PipelineError
            ? error
            : new PipelineError(
                'ocr_extract_failed',
                error instanceof Error ? error.message : 'OCR fallback failed.',
                200
              );
        extractionMethod = usefulTextLength > 0 ? 'pdf_text_only' : 'metadata_only';
        ocrSkippedReason = `${pipelineError.stage}: ${pipelineError.message}`;
      }
    }

    const classifiedPages = classifyPages(pages);
    const extractedFields = extractEntities(pages, classifiedPages);
    const ocrPagesOnly = pages.filter((page) => page.method === 'ocr');
    const averageOcrConfidence = clamp(
      ocrPagesOnly.length
        ? ocrPagesOnly.reduce((sum, page) => sum + page.confidence, 0) / ocrPagesOnly.length
        : 0
    );
    const validationErrors = validateClaim(
      extractedFields,
      pages,
      classifiedPages,
      ocrPagesOnly.length > 0 ? averageOcrConfidence : 0
    );
    const scores = scoreClaim(extractedFields, validationErrors, pages);
    const repairSuggestions = buildRepairSuggestions(validationErrors);

    const responseBody: V2Response = {
      success: true,
      extractionMethod,
      capabilities: routeCapabilities,
      ...(ocrSkippedReason ? { ocrSkippedReason } : {}),
      claimId,
      uploadSessionId,
      pageCount,
      classifiedPages,
      extractedFields,
      validationErrors,
      claimHealth: scores.claimHealth,
      readiness: scores.readiness,
      ocrConfidence: scores.ocrConfidence,
      rejectionRisk: scores.rejectionRisk,
      repairSuggestions,
      intake: session as ClaimSession,
      pdfType,
    };

    const fields = buildUiFields(extractedFields);
    const validation = buildUiValidation(responseBody, pages, file.name);
    const claimAudit = buildClaimAudit(responseBody);

    try {
      const { saveReviewClaim } = await import('@/lib/liveClaims');
      await saveReviewClaim({
        userId: user.id,
        claimId,
        confirmedData: buildConfirmedData(responseBody),
        reviewReasons: validationErrors.map((issue) => issue.issue),
      });
    } catch (error) {
      console.error('Failed to save processed claim:', error);
    }

    return NextResponse.json({
      ...responseBody,
      fields,
      validation,
      claimAudit,
      extractedTextLength: pages.reduce((sum, page) => sum + page.text.length, 0),
      extractionSource: 'claim_v2_pipeline',
    });
  } catch (error) {
    if (error instanceof PipelineError) return jsonPipelineError(error, session);
    return jsonPipelineError(
      new PipelineError(
        'validation_failed',
        error instanceof Error ? error.message : 'Unexpected claim processing failure.',
        500
      ),
      session
    );
  }
}
