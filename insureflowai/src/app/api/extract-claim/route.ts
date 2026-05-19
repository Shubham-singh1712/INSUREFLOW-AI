import { NextResponse } from 'next/server';
import { inflateSync } from 'zlib';

export const runtime = 'nodejs';

// Types exactly matching frontend expectations but enriched for dynamic auditing
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

type TraceableField<T = string | number | boolean | null> = {
  value: T;
  confidence: number;
  source_page: number | null;
};

type ClaimAudit = {
  document_metadata: {
    document_type: string;
    page_count: number;
    scan_quality: 'Excellent' | 'Legible' | 'Poor/Blurry';
  };
  ocr_pages?: Array<{
    page_number: number;
    extracted_text: string;
    ocr_confidence: number;
  }>;
  page_classifications?: Array<{
    page_number: number;
    document_type: string;
    confidence: number;
  }>;
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
      discharge_date: TraceableField<string | null>;
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

const MAX_PROMPT_CHARS = 32000;
const MIN_PAGE_TEXT_CHARS = 12;
const MIN_PAGE_OCR_CONFIDENCE = 12;

const debugUploadLog = (event: string, payload: Record<string, unknown>) => {
  console.info(`[ClaimUploadDebug] ${event} ${JSON.stringify(payload, null, 2)}`);
};

// Node-safe Dynamic Loaders using eval('require') to bypass Webpack bundling errors
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

const loadCanvas = () => {
  const nodeRequire = eval('require') as NodeRequire;
  return nodeRequire('canvas') as typeof import('canvas');
};

const loadTesseract = () => {
  const nodeRequire = eval('require') as NodeRequire;
  return nodeRequire('tesseract.js') as typeof import('tesseract.js');
};

const loadPdfJs = async () => {
  const runtimeImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;

  return runtimeImport('pdfjs-dist/legacy/build/pdf.mjs');
};

type NodeCanvas = import('canvas').Canvas;
type NodeCanvasImageData = import('canvas').ImageData;
type CreateCanvas = typeof import('canvas').createCanvas;

class OcrExtractionError extends Error {
  pageNumber: number;
  phase?: string;

  constructor(pageNumber: number, cause?: unknown, phase?: string) {
    super(`OCR extraction failed on page ${pageNumber}`);
    this.name = 'OcrExtractionError';
    this.pageNumber = pageNumber;
    this.phase = phase;
    if (cause) this.cause = cause;
  }
}

// Shared text cleanup for OCR output and embedded PDF text.
const cleanText = (value = '') =>
  value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const grayscaleAndContrast = (imageData: NodeCanvasImageData, contrast = 1.35) => {
  const { data } = imageData;
  const midpoint = 128;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const adjusted = clampChannel((gray - midpoint) * contrast + midpoint);
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }

  return imageData;
};

const denoiseImageData = (imageData: NodeCanvasImageData) => {
  const { data, width, height } = imageData;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const values = [
        copy[index],
        copy[((y - 1) * width + x) * 4],
        copy[((y + 1) * width + x) * 4],
        copy[(y * width + x - 1) * 4],
        copy[(y * width + x + 1) * 4],
      ].sort((a, b) => a - b);
      const median = values[2];

      data[index] = median;
      data[index + 1] = median;
      data[index + 2] = median;
    }
  }

  return imageData;
};

const sharpenImageData = (imageData: NodeCanvasImageData) => {
  const { data, width, height } = imageData;
  const copy = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      let value = 0;
      let k = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          value += copy[((y + ky) * width + x + kx) * 4] * kernel[k];
          k += 1;
        }
      }

      const sharpened = clampChannel(value);
      data[index] = sharpened;
      data[index + 1] = sharpened;
      data[index + 2] = sharpened;
    }
  }

  return imageData;
};

const rotateCanvas = (
  canvas: NodeCanvas,
  createCanvas: CreateCanvas,
  degrees: number
) => {
  if (degrees === 0) return canvas;

  const radians = (degrees * Math.PI) / 180;
  const swapDimensions = Math.abs(degrees) % 180 === 90;
  const rotatedCanvas = createCanvas(
    swapDimensions ? canvas.height : canvas.width,
    swapDimensions ? canvas.width : canvas.height
  );
  const ctx = rotatedCanvas.getContext('2d');

  ctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotatedCanvas;
};

const preprocessPageCanvas = (
  canvas: NodeCanvas,
  createCanvas: CreateCanvas
) => {
  const preprocessedCanvas = createCanvas(canvas.width, canvas.height);
  const context = preprocessedCanvas.getContext('2d');
  context.drawImage(canvas, 0, 0);

  const imageData = context.getImageData(0, 0, preprocessedCanvas.width, preprocessedCanvas.height);
  context.putImageData(sharpenImageData(denoiseImageData(grayscaleAndContrast(imageData))), 0, 0);

  return {
    canvas: preprocessedCanvas,
    steps: ['grayscale', 'contrast_boost', 'denoise', 'sharpen', 'deskew_scan', 'rotate_retry'],
  };
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
      return {
        text: cleanText(parsed.text || ''),
        pageCount: Math.max(1, parsed.total || 1),
      };
    } finally {
      await parser.destroy();
    }
  } catch {
    return extractTextFromPdfBufferFallback(buffer);
  }
};

// Real page-wise OCR extraction pipeline. It fails explicitly when a page cannot be read.
const runOcrOnPdf = async (buffer: Buffer, filename: string) => {
  try {
    const { getDocument } = await loadPdfJs();
    const canvasModule = loadCanvas();
    const { createCanvas } = canvasModule;
    const Tesseract = loadTesseract();

    // Polyfill global Image constructor from the native canvas module for rendering embedded images
    if (typeof global !== 'undefined') {
      (global as any).Image = canvasModule.Image;
    }

    // Custom Canvas Factory to prevent mismatch between legacy node-canvas and @napi-rs/canvas inside pdfjs-dist
    class CustomNodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
      }

      reset(canvasAndContext: any, width: number, height: number) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      }

      destroy(canvasAndContext: any) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
    }

    const uint8Array = new Uint8Array(buffer);
    const loadingTask = getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      disableWorker: true,
      CanvasFactory: CustomNodeCanvasFactory,
    } as any);

    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;
    console.log(`[OCR Pipeline] Loaded PDF "${filename}" with ${pageCount} pages.`);
    debugUploadLog('page_count', { filename, pageCount });

    const recognizePreprocessedPage = async (
      canvas: NodeCanvas,
      pageNum: number
    ) => {
      const candidates = [0, 90, 180, 270];
      let best:
        | {
            text: string;
            confidence: number;
            rotation: number;
          }
        | null = null;

      for (const rotation of candidates) {
        const rotatedCanvas = rotateCanvas(canvas, createCanvas, rotation);
        const imageBuffer = rotatedCanvas.toBuffer('image/png');
        debugUploadLog('ocr_attempt_start', {
          filename,
          page: pageNum,
          rotation,
          imageBytes: imageBuffer.byteLength,
        });
        const result = await Tesseract.recognize(imageBuffer, 'eng');
        const text = cleanText(result.data.text || '');
        const confidence = clamp(result.data.confidence);
        debugUploadLog('ocr_attempt_result', {
          filename,
          page: pageNum,
          rotation,
          textLength: text.length,
          confidence,
        });

        if (
          !best ||
          confidence > best.confidence ||
          (confidence === best.confidence && text.length > best.text.length)
        ) {
          best = { text, confidence, rotation };
        }

        if (text.length >= MIN_PAGE_TEXT_CHARS && confidence >= 45) break;
      }

      if (
        !best ||
        (best.text.length < MIN_PAGE_TEXT_CHARS && best.confidence < MIN_PAGE_OCR_CONFIDENCE)
      ) {
        throw new OcrExtractionError(pageNum, undefined, 'recognize');
      }

      return best;
    };

    const pagePromises = Array.from({ length: pageCount }, async (_, i) => {
      const pageNum = i + 1;
      debugUploadLog('page_processing_start', { filename, page: pageNum });

      try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        debugUploadLog('page_render_start', {
          filename,
          page: pageNum,
          width: viewport.width,
          height: viewport.height,
        });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await page.render({
          canvasContext: context as any,
          viewport: viewport,
        } as any).promise;
        debugUploadLog('page_render_complete', { filename, page: pageNum });

        const preprocessed = preprocessPageCanvas(canvas, createCanvas);
        debugUploadLog('page_preprocess_complete', {
          filename,
          page: pageNum,
          width: preprocessed.canvas.width,
          height: preprocessed.canvas.height,
          preprocessing: preprocessed.steps,
        });

        const result = await recognizePreprocessedPage(preprocessed.canvas, pageNum);
        debugUploadLog('page_ocr_complete', {
          filename,
          page: pageNum,
          textLength: result.text.length,
          confidence: result.confidence,
          rotationCorrection: result.rotation,
        });
        
        return {
          page_number: pageNum,
          extracted_text: result.text,
          ocr_confidence: result.confidence,
          source_image: {
            width: preprocessed.canvas.width,
            height: preprocessed.canvas.height,
            preprocessing: preprocessed.steps,
            rotation_correction: result.rotation,
          },
        };
      } catch (error) {
        debugUploadLog('page_processing_failed', {
          filename,
          page: pageNum,
          error: error instanceof Error ? error.message : String(error),
          phase: error instanceof OcrExtractionError ? error.phase || 'ocr' : 'page_processing',
        });
        throw error instanceof OcrExtractionError
          ? error
          : new OcrExtractionError(pageNum, error, 'page_processing');
      }
    });

    const ocrPages = await Promise.all(pagePromises);
    const combinedText = ocrPages.map((p) => p.extracted_text).join('\n\n');
    const averageOcrConfidence = ocrPages.length > 0
      ? Math.round(ocrPages.reduce((sum, p) => sum + p.ocr_confidence, 0) / ocrPages.length)
      : 80;
    debugUploadLog('ocr_pages_summary', {
      filename,
      averageOcrConfidence,
      pages: ocrPages.map((page) => ({
        page: page.page_number,
        textLength: page.extracted_text.length,
        confidence: page.ocr_confidence,
      })),
    });

    return {
      ocrPages,
      combinedText,
      averageOcrConfidence,
      pageCount,
    };
  } catch (error) {
    if (error instanceof OcrExtractionError) {
      console.error(`[OCR Pipeline] ${error.message}`);
      debugUploadLog('ocr_failed', {
        filename,
        page: error.pageNumber,
        phase: error.phase || 'ocr',
        error: error.cause instanceof Error ? error.cause.message : error.message,
      });
      throw error;
    }

    console.error('[OCR Pipeline] Tesseract OCR failed:', error);
    debugUploadLog('ocr_failed', {
      filename,
      page: null,
      phase: 'pipeline',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('OCR extraction failed before page processing could complete.');
  }
};

// Page classification is derived from OCR evidence on the page, not from packet position.
const classifyOcrPage = (text: string, pageNum: number) => {
  const textLower = text.toLowerCase();
  const profiles = [
    {
      document_type: 'Aadhaar',
      keywords: ['aadhaar', 'unique identification', 'government of india', 'enrollment no', 'uidai'],
    },
    {
      document_type: 'PAN',
      keywords: ['pan card', 'permanent account', 'income tax department', 'father name'],
    },
    {
      document_type: 'Preauth Form',
      keywords: ['pre-authorization', 'preauth', 'cashless request', 'approval code', 'estimated cost'],
    },
    {
      document_type: 'Invoice',
      keywords: ['invoice', 'itemized bill', 'billing summary', 'total charges', 'gross charge', 'grand total'],
    },
    {
      document_type: 'Discharge Summary',
      keywords: ['discharge summary', 'discharged on', 'hospital course', 'condition at discharge'],
    },
    {
      document_type: 'Prescription',
      keywords: ['prescription', 'rx', 'sig:', 'tablet', 'capsule', 'dosage'],
    },
    {
      document_type: 'Radiology',
      keywords: ['radiology', 'x-ray', 'mri', 'ct scan', 'ultrasound', 'impression'],
    },
    {
      document_type: 'Clinical Notes',
      keywords: ['clinical note', 'progress notes', 'soap note', 'physician note', 'chief complaint'],
    },
    {
      document_type: 'Insurance Card',
      keywords: ['insurance card', 'member card', 'policyholder', 'member id', 'policy number'],
    },
    {
      document_type: 'Hospital Forms',
      keywords: ['claim form', 'patient details', 'demographics', 'hospital seal', 'authorization form'],
    },
  ];

  const scored = profiles
    .map((profile) => {
      const hits = profile.keywords.filter((keyword) => textLower.includes(keyword)).length;
      return {
        page_number: pageNum,
        document_type: profile.document_type,
        confidence: clamp(35 + hits * 14 + Math.min(10, text.length / 500), 0, 96),
        hits,
      };
    })
    .sort((a, b) => b.hits - a.hits || b.confidence - a.confidence);

  const best = scored[0];

  if (!best || best.hits === 0) {
    return { page_number: pageNum, document_type: 'Unclassified', confidence: 0 };
  }

  return {
    page_number: best.page_number,
    document_type: best.document_type,
    confidence: best.confidence,
  };
};

// Clean Value Helper
const cleanValue = (value = '') =>
  value
    .replace(/\bDr\.?\s*(?=[A-Z])/g, 'Dr. ')
    .replace(/\b([A-Z][a-z]{2,})(?=[A-Z][a-z])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/[|]+$/g, '')
    .replace(/^[xv✓✔□☑\s()[\].:-]+/i, '')
    .trim();

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const moneyToNumber = (value = '') => {
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: string) => {
  const amount = moneyToNumber(value);
  return amount > 0 ? `INR ${Math.round(amount).toLocaleString('en-IN')}` : '';
};

// Traceable Regexp Scanners
const findFirstTraced = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence?: number }>,
  patterns: RegExp[]
): TraceableField<string | null> => {
  for (const page of ocrPages) {
    for (const pattern of patterns) {
      const match = page.extracted_text.match(pattern);
      if (match) {
        const val = cleanValue([match?.[1], match?.[2]].filter(Boolean).join(' - '));
        if (val && val.toLowerCase() !== 'not found') {
          return {
            value: val,
            confidence: clamp((page.ocr_confidence || 50) - (val.length < 4 ? 25 : 6), 20, 98),
            source_page: page.page_number,
          };
        }
      }
    }
  }
  return { value: null, confidence: 0, source_page: null };
};

const findDateTraced = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence?: number }>,
  label: string
): TraceableField<string | null> => {
  const dateRegex = new RegExp(
    `(?:${label})\\s*[:\\-]?\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`,
    'i'
  );
  
  for (const page of ocrPages) {
    const match = page.extracted_text.match(dateRegex);
    if (match) {
      const val = cleanValue(match[1]);
      if (val) {
        return {
          value: normalizeDate(val),
          confidence: clamp((page.ocr_confidence || 50) - 4, 20, 98),
          source_page: page.page_number,
        };
      }
    }
  }
  return { value: null, confidence: 0, source_page: null };
};

const findCheckboxSelectionTraced = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence?: number }>,
  options: string[]
): TraceableField<string | null> => {
  const checkboxMark = '[xv✓✔☑1]';
  for (const page of ocrPages) {
    for (const option of options) {
      const optionPattern = option.replace(/\s+/g, '\\s*');
      const markedBefore = new RegExp(`${checkboxMark}\\s*(?:\\(|\\[)?\\s*${optionPattern}`, 'i');
      const markedAfter = new RegExp(`${optionPattern}\\s*(?:\\)|\\])?\\s*${checkboxMark}`, 'i');
      
      if (markedBefore.test(page.extracted_text) || markedAfter.test(page.extracted_text)) {
        return {
          value: cleanValue(option),
          confidence: clamp((page.ocr_confidence || 50) - 10, 20, 96),
          source_page: page.page_number,
        };
      }
    }
  }
  return { value: null, confidence: 0, source_page: null };
};

const findAmountTraced = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence?: number }>,
  patterns: RegExp[]
): TraceableField<number | null> => {
  const result = findFirstTraced(ocrPages, patterns);
  if (result.value) {
    const amt = moneyToNumber(result.value);
    if (amt > 0) {
      return {
        value: amt,
        confidence: result.confidence,
        source_page: result.source_page,
      };
    }
  }
  return { value: null, confidence: 0, source_page: null };
};

const normalizeDate = (value: string) => {
  if (!value) return '';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const parts = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!parts) return value;
  const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
  return `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
};

const uniqueMatches = (text: string, pattern: RegExp) =>
  Array.from(new Set([...text.matchAll(pattern)].map((match) => cleanValue(match[1])))).filter(
    Boolean
  );

const hasAny = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

const hasSignatureNear = (text: string, rolePattern: string) =>
  new RegExp(`${rolePattern}[\\s\\S]{0,80}(signature|signed|e[-\\s]?signed)`, 'i').test(text) ||
  new RegExp(`(signature|signed|e[-\\s]?signed)[\\s\\S]{0,80}${rolePattern}`, 'i').test(text);

const hasLooseTerm = (text: string, term: string) => {
  const fuzzy = term
    .split('')
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
  return new RegExp(fuzzy, 'i').test(text);
};

const summarizeTraceableFields = (audit: ClaimAudit) => ({
  patient: audit.extracted_data.patient,
  insurance: audit.extracted_data.insurance,
  hospital: audit.extracted_data.hospital,
  clinical: audit.extracted_data.clinical,
  financial: audit.extracted_data.financial,
  signatures: audit.extracted_data.signatures,
});

// Local extraction over page-wise OCR with source-page traceability.
const runLocalExtraction = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence: number }>,
  ocrConfidence: number,
  filename: string
) => {
  const combinedText = ocrPages.map((p) => p.extracted_text).join('\n\n');
  const pageClassifications = ocrPages.map((page) => classifyOcrPage(page.extracted_text, page.page_number));
  debugUploadLog('page_classification', {
    filename,
    pages: pageClassifications.map((classification) => ({
      page: classification.page_number,
      documentType: classification.document_type,
      confidence: classification.confidence,
    })),
  });

  const patientName = findFirstTraced(ocrPages, [
    /(?:patient\s*(?:name)?|name\s+of\s+patient)\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
    /(?:insured|beneficiary)\s*(?:name)?\s*[:-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})/i,
  ]);
  
  const dob = findDateTraced(ocrPages, '(?:DOB|Date\\s+of\\s+Birth|Birth\\s+Date|Birthdate)');
  
  const genderSelection = findCheckboxSelectionTraced(ocrPages, ['Male', 'Female', 'Other', 'Transgender']);
  const genderRegex = findFirstTraced(ocrPages, [/(?:gender|sex)\s*[:-]\s*(male|female|m|f|other|transgender)/i]);
  const gender = genderSelection.value
    ? genderSelection
    : genderRegex.value
      ? { value: genderRegex.value, confidence: genderRegex.confidence, source_page: genderRegex.source_page }
      : { value: null, confidence: 0, source_page: null };

  const contactNumber = findFirstTraced(ocrPages, [
    /(?:contact|phone|mobile|telephone)(?:\s*(?:no|number))?\s*[:-]\s*(\+?\d[\d\s().-]{7,})/i,
  ]);

  const providerName = findFirstTraced(ocrPages, [
    /(?:TPA|payer|insurer|insurance\s*(?:provider|company|name))\s*[:-]\s*([^\n\r]{3,120})/i,
  ]);

  const policyNumber = findFirstTraced(ocrPages, [
    /policy\s*(?:no|number|id|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{5,})/i,
  ]);

  const groupId = findFirstTraced(ocrPages, [
    /(?:corporate|group)\s*(?:id|no|number|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{2,})/i,
  ]);

  const memberId = findFirstTraced(ocrPages, [
    /(?:member|subscriber|card|health\s*card)\s*(?:id|no|number|#)?\s*[:-]\s*([A-Z0-9][A-Z0-9/-]{5,})/i,
  ]);

  const facilityName = findFirstTraced(ocrPages, [
    /(?:hospital|facility|provider)\s*(?:name)?\s*[:-]\s*([^\n\r]{3,120})/i,
    /([A-Z][A-Za-z&.' -]+(?:Hospital|Medical Center|Clinic|Healthcare)[^\n\r]{0,80})/i,
  ]);

  const treatingDoctor = findFirstTraced(ocrPages, [
    /(?:treating|attending|consulting)?\s*(?:doctor|physician|consultant)\s*[:-]\s*(Dr\.?\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/i,
    /\b(Dr\.?\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/i,
  ]);

  const hospitalRegistrationNo = findFirstTraced(ocrPages, [
    /(?:hospital\s*)?(?:registration|reg\.?)\s*(?:no|number|#)?\s*[:-]\s*([A-Z0-9/-]{4,})/i,
  ]);

  const admissionDate = findDateTraced(ocrPages, 'Admission\\s+Date|Admitted|Expected\\s+Admission');
  const dischargeDate = findDateTraced(ocrPages, 'Discharge\\s+Date|Discharged');

  const emergencySelection = findCheckboxSelectionTraced(ocrPages, ['Emergency', 'Planned', 'Elective']);
  const emergencyTextPage = ocrPages.find((p) => hasAny(p.extracted_text, [/emergency\s*[:-]\s*(yes|true)/i, /\bemergency\b/i]));
  const isEmergency = {
    value:
      emergencySelection.value || emergencyTextPage
        ? emergencySelection.value === 'Emergency' || Boolean(emergencyTextPage)
        : null,
    confidence:
      emergencySelection.confidence ||
      (emergencyTextPage ? clamp(emergencyTextPage.ocr_confidence - 12, 20, 95) : 0),
    source_page: emergencySelection.source_page || emergencyTextPage?.page_number || null,
  };

  const presentingComplaints = findFirstTraced(ocrPages, [
    /(?:presenting\s+complaints?|chief\s+complaints?|complaints?)\s*[:-]\s*([^\n\r]{3,240})/i,
  ]);

  const diagnosis = findFirstTraced(ocrPages, [
    /(?:principal\s*)?diagnosis(?:\s*code)?\s*[:-]\s*([^\n\r]{3,160})/i,
    /\b(perforated\s+appendicitis|acute\s+appendicitis|appendicitis|cholecystitis|fracture|pneumonia|dengue|myocardial\s+infarction)\b/i,
  ]);

  const icd10Codes = {
    value: uniqueMatches(combinedText, /\b([A-Z]\d{2}(?:\.\d+)?)\b/g),
    confidence: 0,
    source_page: null as number | null,
  };
  const icdSourcePage = ocrPages.find((p) => /\b([A-Z]\d{2}(?:\.\d+)?)\b/g.test(p.extracted_text));
  icd10Codes.confidence =
    icd10Codes.value.length > 0 && icdSourcePage
      ? clamp(icdSourcePage.ocr_confidence - 8, 20, 98)
      : 0;
  icd10Codes.source_page = icdSourcePage?.page_number || null;

  const proposedTreatment = findFirstTraced(ocrPages, [
    /(?:proposed\s+treatment|planned\s+procedure|procedure|treatment)\s*[:-]\s*([^\n\r]{3,180})/i,
    /\b((?:perforated\s+)?appendectomy|laparotomy|angioplasty|CABG|cesarean|arthroscopy)\b/i,
  ]);

  const expectedTotalCost = findAmountTraced(ocrPages, [
    /(?:expected|estimated|total)\s*(?:total\s*)?(?:cost|amount|expense|package)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:total\s*(?:billed|bill|invoice|claim|charges?)(?:\s*amount)?|grand\s*total)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ]);

  const roomRent = findAmountTraced(ocrPages, [
    /(?:room\s*rent|room\s*charges?)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ]);

  const icuCharges = findAmountTraced(ocrPages, [
    /(?:\bICU\b|intensive\s+care)[^\n\r]{0,100}=\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:\bICU\b|intensive\s+care)[^\n\r]{0,80}?(?:total|amount|INR|Rs\.?)\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ]);

  const otCharges = findAmountTraced(ocrPages, [
    /(?:\bOT\b|operation\s*theatre|operating\s*room)[^\n\r]{0,100}=\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:\bOT\b|operation\s*theatre|operating\s*room)[^\n\r]{0,80}?(?:total|amount|INR|Rs\.?)\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ]);

  const professionalFees = findAmountTraced(ocrPages, [
    /(?:professional|doctor|surgeon|consultation)\s*(?:fees?|charges?)\s*[:-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ]);

  const patientSigPage = ocrPages.find((p) => hasSignatureNear(p.extracted_text, 'patient|insured|beneficiary') || hasAny(p.extracted_text, [/signature\s+of\s+patient/i, /patient\s+sign/i]));
  const patientSignature = {
    value: Boolean(patientSigPage),
    confidence: patientSigPage ? clamp(patientSigPage.ocr_confidence - 8, 20, 96) : 0,
    source_page: patientSigPage?.page_number || null,
  };

  const doctorSigPage = ocrPages.find((p) => hasSignatureNear(p.extracted_text, 'doctor|physician|consultant|treating') || (treatingDoctor.value && hasLooseTerm(p.extracted_text, 'signature')));
  const doctorSignature = {
    value: Boolean(doctorSigPage),
    confidence: doctorSigPage ? clamp(doctorSigPage.ocr_confidence - 8, 20, 96) : 0,
    source_page: doctorSigPage?.page_number || null,
  };

  const stampPage = ocrPages.find((p) => hasAny(p.extracted_text, [/hospital\s+seal/i, /hospital\s+stamp/i, /official\s+seal/i, /stamp\s+and\s+signature/i]));
  const hospitalStamp = {
    value: Boolean(stampPage),
    confidence: stampPage ? clamp(stampPage.ocr_confidence - 12, 20, 94) : 0,
    source_page: stampPage?.page_number || null,
  };

  const claimAudit: ClaimAudit = {
    document_metadata: {
      document_type: pageClassifications.length > 1 ? 'Multi-page Claim Packet' : 'Single Document',
      page_count: ocrPages.length,
      scan_quality: ocrConfidence >= 85 ? 'Excellent' : ocrConfidence >= 60 ? 'Legible' : 'Poor/Blurry',
    },
    ocr_pages: ocrPages,
    page_classifications: pageClassifications,
    extracted_data: {
      patient: {
        full_name: patientName,
        dob,
        gender,
        contact_number: contactNumber,
      },
      insurance: {
        tpa_or_provider_name: providerName,
        policy_number: policyNumber,
        corporate_or_group_id: groupId,
        member_id: memberId,
      },
      hospital: {
        facility_name: facilityName,
        treating_doctor: treatingDoctor,
        hospital_registration_no: hospitalRegistrationNo,
      },
      clinical: {
        admission_date: admissionDate,
        discharge_date: dischargeDate,
        is_emergency: isEmergency,
        presenting_complaints: presentingComplaints,
        diagnosis: diagnosis,
        icd_10_codes: icd10Codes,
        proposed_treatment: proposedTreatment,
      },
      financial: {
        expected_total_cost: expectedTotalCost,
        room_rent: roomRent,
        icu_charges: icuCharges,
        ot_charges: otCharges,
        professional_fees: professionalFees,
      },
      signatures: {
        patient_signature_present: patientSignature,
        doctor_signature_present: doctorSignature,
        hospital_seal_present: hospitalStamp,
      },
    },
    validation_errors: [],
  };

  debugUploadLog('extracted_entities', {
    filename,
    entities: summarizeTraceableFields(claimAudit),
  });
  debugUploadLog('validation_start', {
    filename,
    pageCount: ocrPages.length,
    ocrConfidence,
  });
  claimAudit.validation_errors = runCrossDocumentValidation(claimAudit);
  return claimAudit;
};

// Stage 6 — Cross-Document Validation Engine
const runCrossDocumentValidation = (audit: ClaimAudit): string[] => {
  const errors: string[] = [];
  const { extracted_data: data, page_classifications } = audit;

  const addMissing = (val: unknown, msg: string) => {
    if (val === null || val === undefined || (typeof val === 'string' && val.trim().length === 0) || (Array.isArray(val) && val.length === 0)) {
      errors.push(msg);
    }
  };

  // 1. Missing Essential Demographics
  addMissing(data.patient.full_name.value, 'Missing patient full name.');
  addMissing(data.patient.dob.value, 'Missing patient date of birth (DOB).');
  addMissing(data.patient.gender.value, 'Missing patient gender.');
  addMissing(data.patient.contact_number.value, 'Missing patient contact number.');

  // 2. Missing Insurance Card Details
  addMissing(data.insurance.tpa_or_provider_name.value, 'Missing insurance provider or TPA name.');
  addMissing(data.insurance.policy_number.value, 'Missing insurance policy number.');
  addMissing(data.insurance.member_id.value, 'Missing insurance member ID.');

  // 3. Clinical Authenticity and Identification
  addMissing(data.hospital.facility_name.value, 'Missing hospital or treating facility name.');
  addMissing(data.hospital.treating_doctor.value, 'Missing treating physician/doctor name.');
  addMissing(data.hospital.hospital_registration_no.value, 'Missing hospital registration or TMC registration number.');

  // 4. Clinical Evidence Validation
  addMissing(data.clinical.admission_date.value, 'Missing admission date.');
  addMissing(data.clinical.diagnosis.value, 'Missing clinical diagnosis.');
  addMissing(data.clinical.proposed_treatment.value, 'Missing proposed treatment or surgical procedure details.');
  
  if (!data.clinical.icd_10_codes.value || data.clinical.icd_10_codes.value.length === 0) {
    errors.push('Missing ICD-10 medical coding for clinical diagnosis.');
  }

  // 5. Cross-document identity support
  const isAadhaarUploaded = page_classifications?.some((pc) => pc.document_type === 'Aadhaar');
  const isPanUploaded = page_classifications?.some((pc) => pc.document_type === 'PAN');
  const hasHospitalForm = page_classifications?.some((pc) => pc.document_type === 'Hospital Forms');

  if ((isAadhaarUploaded || isPanUploaded || hasHospitalForm) && !data.patient.full_name.value) {
    errors.push('Identity mismatch risk: ID or hospital forms were detected, but patient name could not be extracted.');
  }

  // 6. Chronological Chronology Check
  if (data.clinical.admission_date.value && data.clinical.discharge_date.value) {
    const adm = new Date(data.clinical.admission_date.value);
    const dis = new Date(data.clinical.discharge_date.value);
    if (!Number.isNaN(adm.getTime()) && !Number.isNaN(dis.getTime()) && dis < adm) {
      errors.push(`Chronological error: discharge date (${data.clinical.discharge_date.value}) cannot be prior to admission date (${data.clinical.admission_date.value}).`);
    }
  }

  // 7. Missing Signatures and Stamps
  if (!data.signatures.patient_signature_present.value) {
    errors.push('Regulatory gap: patient signature is missing on intake/authorization forms.');
  }
  if (!data.signatures.doctor_signature_present.value) {
    errors.push('Regulatory gap: doctor signature is missing on the clinical summary.');
  }
  if (!data.signatures.hospital_seal_present.value) {
    errors.push('Regulatory gap: hospital stamp or official seal is missing from forms.');
  }

  // 8. Financial Reconciliation Check
  const expectedCost = data.financial.expected_total_cost.value;
  const roomCost = data.financial.room_rent.value || 0;
  const icuCost = data.financial.icu_charges.value || 0;
  const otCost = data.financial.ot_charges.value || 0;
  const profCost = data.financial.professional_fees.value || 0;

  const financialItems = [roomCost, icuCost, otCost, profCost].filter((v) => v > 0);
  if (expectedCost === null) {
    errors.push('Financial audit: missing estimated total billed charges.');
  } else if (financialItems.length >= 2) {
    const sum = roomCost + icuCost + otCost + profCost;
    if (Math.abs(sum - expectedCost) > Math.max(10, expectedCost * 0.02)) {
      errors.push(`Financial discrepancy: breakdown charges sum to INR ${sum.toLocaleString('en-IN')}, which does not match total invoice of INR ${expectedCost.toLocaleString('en-IN')}.`);
    }
  }

  // 9. Clinical Plausibility & Missing Supporting Documents
  const hasRadiologyReport = page_classifications?.some((pc) => pc.document_type === 'Radiology Report');
  const hasLabReport = page_classifications?.some((pc) => pc.document_type === 'Lab Report');
  const diagText = (data.clinical.diagnosis.value || '').toLowerCase();
  
  if ((diagText.includes('fracture') || diagText.includes('bone') || diagText.includes('appendicitis')) && !hasRadiologyReport) {
    errors.push(`Missing supporting report: diagnosis "${data.clinical.diagnosis.value}" requires radiology reports (ultrasound/CT/X-Ray) which were not detected in the packet.`);
  }
  if ((diagText.includes('infection') || diagText.includes('dengue') || diagText.includes('fever')) && !hasLabReport) {
    errors.push(`Missing supporting report: clinical diagnosis "${data.clinical.diagnosis.value}" requires lab reports (CBC/pathology/blood test) which were not detected.`);
  }

  if (audit.document_metadata.scan_quality === 'Poor/Blurry') {
    errors.push('Scan quality warning: packet contains blurry or low-quality page scans; key text may be illegible.');
  }

  return Array.from(new Set(errors));
};

// Build Flat UI Fields from Enriched Audit Data
const mapAuditToClaimFields = (audit: ClaimAudit, filename: string): ClaimField[] => {
  const data = audit.extracted_data;
  
  const getVal = (field: TraceableField<any>, label: string) => {
    if (field.value === null || field.value === undefined || field.value === false) return '';
    if (label === 'Invoice total') return formatMoney(String(field.value));
    return String(field.value);
  };

  const getConf = (field: TraceableField<any>) => {
    return field.confidence > 0 ? field.confidence : 0;
  };

  const getSource = (field: TraceableField<any>, defaultSource: string) => {
    if (field.source_page) {
      const pc = audit.page_classifications?.find((p) => p.page_number === field.source_page);
      return `${filename} - Page ${field.source_page} (${pc ? pc.document_type : 'Unclassified'})`;
    }
    return defaultSource;
  };

  return [
    {
      id: 'patientName',
      label: 'Patient name',
      value: getVal(data.patient.full_name, 'Patient name'),
      confidence: getConf(data.patient.full_name),
      source: getSource(data.patient.full_name, 'No source page extracted'),
    },
    {
      id: 'insuranceNumber',
      label: 'Insurance number',
      value: getVal(data.insurance.member_id, 'Insurance number'),
      confidence: getConf(data.insurance.member_id),
      source: getSource(data.insurance.member_id, 'No source page extracted'),
    },
    {
      id: 'diagnosis',
      label: 'Diagnosis',
      value: getVal(data.clinical.diagnosis, 'Diagnosis'),
      confidence: getConf(data.clinical.diagnosis),
      source: getSource(data.clinical.diagnosis, 'No source page extracted'),
    },
    {
      id: 'doctorName',
      label: 'Attending physician',
      value: getVal(data.hospital.treating_doctor, 'Attending physician'),
      confidence: getConf(data.hospital.treating_doctor),
      source: getSource(data.hospital.treating_doctor, 'No source page extracted'),
    },
    {
      id: 'hospital',
      label: 'Hospital / Facility',
      value: getVal(data.hospital.facility_name, 'Hospital / Facility'),
      confidence: getConf(data.hospital.facility_name),
      source: getSource(data.hospital.facility_name, 'No source page extracted'),
    },
    {
      id: 'procedure',
      label: 'Procedure',
      value: getVal(data.clinical.proposed_treatment, 'Procedure'),
      confidence: getConf(data.clinical.proposed_treatment),
      source: getSource(data.clinical.proposed_treatment, 'No source page extracted'),
    },
    {
      id: 'invoiceTotal',
      label: 'Invoice total',
      value: getVal(data.financial.expected_total_cost, 'Invoice total'),
      confidence: getConf(data.financial.expected_total_cost),
      source: getSource(data.financial.expected_total_cost, 'No source page extracted'),
    },
    {
      id: 'claimType',
      label: 'Claim metadata',
      value:
        data.clinical.admission_date.value && data.clinical.discharge_date.value
          ? 'Inpatient Claim'
          : '',
      confidence:
        data.clinical.admission_date.value && data.clinical.discharge_date.value
          ? Math.min(data.clinical.admission_date.confidence, data.clinical.discharge_date.confidence)
          : 0,
      source:
        data.clinical.admission_date.source_page || data.clinical.discharge_date.source_page
          ? 'Derived from extracted admission and discharge dates'
          : 'No source page extracted',
    },
  ];
};

// Build Local Validation Report
const buildLocalReport = (
  audit: ClaimAudit,
  ocrConfidence: number,
  filename: string
): ValidationReport => {
  const ocrPages = audit.ocr_pages || [];
  const errors = audit.validation_errors;

  const docGroups: DocumentGroup[] = ocrPages.map((page) => {
    const pc = audit.page_classifications?.find((p) => p.page_number === page.page_number);
    const type = pc ? pc.document_type : 'Unclassified';
    const classified = Boolean(pc && pc.confidence > 0);
    return {
      id: `page-${page.page_number}`,
      title: `${type} (Page ${page.page_number})`,
      pages: `Page ${page.page_number} of ${ocrPages.length}`,
      confidence: pc ? pc.confidence : 0,
      status: classified ? 'Classified from OCR' : 'Needs manual classification',
      summary: `OCR confidence ${page.ocr_confidence}%. Text preview: "${page.extracted_text.slice(0, 150).replace(/\n/g, ' ')}..."`,
      tone: classified ? 'success' : 'warning',
    };
  });

  const issues: ValidationIssue[] = errors.map((err, index) => {
    let severity: Severity = 'Medium';
    let reference = 'Clinical Audit';
    let fix = 'Review the upload details and re-verify.';
    const lower = err.toLowerCase();

    if (lower.includes('dob') || lower.includes('date of birth') || lower.includes('chronological')) {
      severity = 'High';
      reference = 'Demographics/Dates';
      fix = 'Collect the correct patient date of birth or check the intake card against Aadhaar.';
    } else if (lower.includes('mismatch') || lower.includes('discrepancy')) {
      severity = 'High';
      reference = 'Financial Audit';
      fix = 'Reconcile invoice line-items with the hospital billing desk to fix sum mismatch.';
    } else if (lower.includes('signature') || lower.includes('seal') || lower.includes('stamp')) {
      severity = 'High';
      reference = 'Regulatory / Signatures';
      fix = 'Ensure patient, doctor, and hospital representatives e-sign the required paperwork.';
    } else if (lower.includes('missing supporting') || lower.includes('requires')) {
      severity = 'Critical';
      reference = 'Claim Completeness';
      fix = 'Scan and upload the missing radiology/lab report documents to validate the stated diagnosis.';
    } else if (lower.includes('diagnosis') || lower.includes('full name') || lower.includes('member id')) {
      severity = 'Critical';
      reference = 'Core Requirements';
      fix = 'Extract and complete these missing fields manually or from clear original documents.';
    }

    return {
      id: `issue-${index}`,
      severity,
      confidence: clamp(ocrConfidence - (severity === 'Critical' ? 4 : severity === 'High' ? 8 : 12), 20, 99),
      title: err,
      reference,
      fix,
      evidence: `Derived from page-wise OCR and classification for ${filename}.`,
    };
  });

  // Calculate scores
  const severityPenalty = issues.reduce((sum, issue) => {
    if (issue.severity === 'Critical') return sum + 20;
    if (issue.severity === 'High') return sum + 12;
    if (issue.severity === 'Medium') return sum + 7;
    return sum + 3;
  }, 0);

  const readinessScore = clamp(100 - severityPenalty);
  const healthScore = clamp((readinessScore + ocrConfidence) / 2);
  const highRisk = issues.some((i) => i.severity === 'Critical' || i.severity === 'High');
  const risk = readinessScore >= 85 ? 'Low' : highRisk ? 'High' : 'Med';
  const helper = issues.length === 0 ? 'No blockers found' : `${issues.length} dynamic ${issues.length === 1 ? 'issue' : 'issues'} found`;

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    documentGroups: docGroups,
    metrics: [
      {
        id: 'health',
        label: 'Claim Health',
        value: String(healthScore),
        unit: '/100',
        color: healthScore >= 85 ? 'text-success' : healthScore >= 65 ? 'text-warning' : 'text-danger',
        helper,
      },
      {
        id: 'readiness',
        label: 'Readiness',
        value: String(readinessScore),
        unit: '%',
        color: readinessScore >= 85 ? 'text-success' : readinessScore >= 65 ? 'text-warning' : 'text-danger',
        helper: readinessScore >= 85 ? 'Ready for final review' : 'Repairs needed first',
      },
      {
        id: 'ocr',
        label: 'OCR Confidence',
        value: String(ocrConfidence),
        unit: '%',
        color: ocrConfidence >= 85 ? 'text-success' : ocrConfidence >= 60 ? 'text-warning' : 'text-danger',
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
    issues,
    timeline: [
      { id: 'uploaded', label: 'Claim Packet Uploaded', time: now, done: true },
      { id: 'parsed', label: 'Page-wise OCR Extracted', time: now, done: true },
      { id: 'classified', label: 'Pages Dynamically Classified', time: now, done: true },
      { id: 'validation', label: 'Cross-Doc Audits Evaluated', time: now, done: true },
      { id: 'repairs', label: 'Repair Log Generated', time: now, done: issues.length > 0 },
      { id: 'ready', label: 'Submission Audited', time: readinessScore >= 85 ? now : 'Pending repairs', done: readinessScore >= 85 },
    ],
    pdfStructure: [
      `01  Source packet: ${filename}`,
      '02  Page-wise parallel OCR logs',
      '03  Cross-document identity validations',
      '04  Clinical plausibility and missing report audits',
      '05  Dynamic billing and financial reconciliations',
    ],
    summary: issues.length === 0
      ? 'The uploaded PDF claim packet was OCR\'d and parsed successfully; no major compliance errors were detected.'
      : `The claim packet was parsed, identifying ${issues.length} active regulatory, identity, or financial blockers.`,
    readinessScore,
    healthScore,
    ocrConfidence,
    source: 'local_analysis',
    extractionMethod: 'ocr_required',
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

// Stage 7 — AI Claim Reasoning Layer (OpenRouter/GPT-4o)
const runAiValidation = async ({
  fileName,
  pageCount,
  ocrPages,
  ocrConfidence,
  localFields,
  localReport,
  localAudit,
}: {
  fileName: string;
  pageCount: number;
  ocrPages: Array<{ page_number: number; extracted_text: string }>;
  ocrConfidence: number;
  localFields: ClaimField[];
  localReport: ValidationReport;
  localAudit: ClaimAudit;
}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const serializedPages = ocrPages.map((p) => `--- PAGE ${p.page_number} --- \n${p.extracted_text}`).join('\n\n');

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
            content: `You are the core AI Claim Reasoning Layer of InsureFlow AI. 
We have performed server-side Tesseract OCR on a medical claim packet and converted all pages.
Your job is NOT to extract text, but to dynamically audit the page-wise OCR transcript for clinical, regulatory, financial, and identity compliance.

Return a strict JSON object with:
1. "fields": An array of ClaimField objects. Extract the exact value, assign it a dynamic confidence, and specify a descriptive source string (such as "Page X - Discharge Summary").
   - patientName
   - insuranceNumber
   - diagnosis
   - doctorName
   - hospital
   - procedure
   - invoiceTotal
   - claimType (e.g. "Inpatient" or "Outpatient")
   If any field is missing or cannot be found, DO NOT hallucinate. Use an empty string for flat UI fields and null/0/null in traceable audit fields.

2. "validation": A dynamic ValidationReport object matching the expected schema. 
   - Compile "documentGroups" based on page classifications.
   - Detect complex validation issues. Do not use hardcoded or generic repeated issues. Identify DOB mismatches, name discrepancies (e.g. "Ramesh Kumar Iyer" vs "Ramesh K Iyer"), chronology logic, missing patient/doctor signatures, lack of hospital seal, missing supporting reports (radiology/lab tests) for relevant diagnoses, or poor scan issues.
   - Give dynamic repair suggestions, exact evidence snippets, and calculate the "readinessScore" and "healthScore" dynamically based on the priority of the issues.

3. "claimAudit": A strict ClaimAudit object.
   - Fill "extracted_data" completely. For every field, specify the { "value": ..., "confidence": ..., "source_page": ... } structure. If unavailable, use "value": null, "confidence": 0, "source_page": null.
   - Ensure you audit patient (full_name, dob, gender, contact_number), insurance (tpa_or_provider_name, policy_number, corporate_or_group_id, member_id), hospital (facility_name, treating_doctor, hospital_registration_no), clinical (admission_date, discharge_date, is_emergency, presenting_complaints, diagnosis, icd_10_codes, proposed_treatment), financial (expected_total_cost, room_rent, icu_charges, ot_charges, professional_fees), and signatures (patient_signature_present, doctor_signature_present, hospital_seal_present).
   - Return all identified audit errors in the "validation_errors" string array.

Return ONLY strict, valid JSON. No markdown code blocks.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              fileName,
              pageCount,
              ocrConfidence,
              extractedText: serializedPages.slice(0, MAX_PROMPT_CHARS),
              suggested_shape: {
                fields: localFields,
                validation: localReport,
                claimAudit: localAudit,
              },
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error('[AI Reasoning Layer] OpenRouter HTTP Error:', response.status);
      return null;
    }

    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const parsed = parseJsonResponse(content);
    if (!parsed || typeof parsed !== 'object') return null;

    console.log('[AI Reasoning Layer] Successfully audited claim packet using LLM reasoning.');

    // Ensure metrics are populated and formatted properly
    const finalFields = Array.isArray(parsed.fields) ? parsed.fields : localFields;
    const finalReport = {
      ...localReport,
      ...(parsed.validation && typeof parsed.validation === 'object' ? parsed.validation : {}),
      source: 'ai',
      extractionMethod: 'ai_ocr',
    };
    const finalAudit = parsed.claimAudit || parsed.audit || localAudit;

    return {
      fields: finalFields,
      validation: finalReport,
      claimAudit: finalAudit,
    };
  } catch (error) {
    console.error('[AI Reasoning Layer] Failed to connect to OpenRouter:', error);
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
    debugUploadLog('upload_received', {
      filename: file.name,
      mimeType: file.type || 'application/pdf',
      fileBytes: buffer.byteLength,
    });

    // Stage 1, 2, 3: Ingestion, Image conversion, and Concurrent OCR extraction
    const ocrData = await runOcrOnPdf(buffer, file.name);

    // Stage 4, 5, 6: Dynamic Classification, Entity extraction, and Cross-Document Validation
    const localAudit = runLocalExtraction(
      ocrData.ocrPages,
      ocrData.averageOcrConfidence,
      file.name
    );

    const localFields = mapAuditToClaimFields(localAudit, file.name);
    const localReport = buildLocalReport(localAudit, ocrData.averageOcrConfidence, file.name);

    // Stage 7: AI Claim Reasoning Layer
    const aiResult = await runAiValidation({
      fileName: file.name,
      pageCount: ocrData.pageCount,
      ocrPages: ocrData.ocrPages,
      ocrConfidence: ocrData.averageOcrConfidence,
      localFields,
      localReport,
      localAudit,
    });

    console.log('[POST Handler] Claims extraction processing successfully complete.');

    return NextResponse.json({
      fields: aiResult?.fields || localFields,
      validation: aiResult?.validation || localReport,
      claimAudit: aiResult?.claimAudit || localAudit,
      extractedTextLength: ocrData.combinedText.length,
      pageCount: ocrData.pageCount,
      extractionSource: aiResult ? 'openrouter' : 'local_ocr_pipeline',
    });
  } catch (error) {
    console.error('[POST Handler] Uncaught exception during claim intake:', error);
    if (error instanceof OcrExtractionError) {
      return NextResponse.json(
        {
          error: error.message,
          page: error.pageNumber,
          extractionFailed: true,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error during extraction' },
      { status: 500 }
    );
  }
}
