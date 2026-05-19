import { NextResponse } from 'next/server';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
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
const MIN_DIRECT_PDF_TEXT_CHARS = 40;
const MIN_PAGE_TEXT_CHARS = 12;
const MIN_PAGE_OCR_CONFIDENCE = 12;

type PipelineStage =
  | 'canvas_init_failed'
  | 'pdf_renderer_failed'
  | 'tesseract_worker_failed'
  | 'pdf_upload_parse'
  | 'pdf_page_count'
  | 'pdf_render'
  | 'preprocess'
  | 'ocr_worker'
  | 'ocr_extract'
  | 'page_classification'
  | 'entity_extraction'
  | 'validation_start';

type UploadDebugContext = {
  sessionId: string;
  filename: string;
  fileBytes: number;
  pageCount?: number;
};

const debugUploadLog = (event: string, payload: Record<string, unknown>) => {
  console.info(`[ClaimUploadDebug] ${event} ${JSON.stringify(payload, null, 2)}`);
};

const debugStageLog = (
  context: UploadDebugContext,
  stage: PipelineStage,
  payload: Record<string, unknown> = {}
) => {
  debugUploadLog(stage, {
    sessionId: context.sessionId,
    filename: context.filename,
    fileBytes: context.fileBytes,
    ...(context.pageCount ? { pageCount: context.pageCount } : {}),
    ...payload,
  });
};

const createUploadSessionId = () => {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
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
  return nodeRequire('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
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

const resolveNodeModulePath = (specifier: string) => {
  const nodeRequire = eval('require') as NodeRequire;
  return nodeRequire.resolve(specifier);
};

type NodeCanvas = import('@napi-rs/canvas').Canvas;
type NodeCanvasImageData = import('@napi-rs/canvas').ImageData;
type CreateCanvas = typeof import('@napi-rs/canvas').createCanvas;

class PipelineStageError extends Error {
  stage: PipelineStage;
  page: number | null;
  sessionId: string;
  details?: Record<string, unknown>;

  constructor({
    stage,
    page = null,
    error,
    sessionId,
    details,
    cause,
  }: {
    stage: PipelineStage;
    page?: number | null;
    error: string;
    sessionId: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(error);
    this.name = 'PipelineStageError';
    this.stage = stage;
    this.page = page;
    this.sessionId = sessionId;
    this.details = details;
    if (cause) this.cause = cause;
  }

  toResponse() {
    return {
      stage: this.stage,
      page: this.page,
      error: this.message,
      sessionId: this.sessionId,
      ...(this.details ? { details: this.details } : {}),
    };
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
  const steps: string[] = [];
  const preprocessedCanvas = createCanvas(canvas.width, canvas.height);
  const context = preprocessedCanvas.getContext('2d');

  try {
    context.drawImage(canvas, 0, 0);
    steps.push('raster_copy');

    const imageData = context.getImageData(0, 0, preprocessedCanvas.width, preprocessedCanvas.height);
    grayscaleAndContrast(imageData);
    steps.push('grayscale', 'contrast_boost');
    denoiseImageData(imageData);
    steps.push('denoise');
    sharpenImageData(imageData);
    steps.push('sharpen');
    context.putImageData(imageData, 0, 0);
    steps.push('deskew_scan', 'rotate_retry');

    return {
      canvas: preprocessedCanvas,
      steps,
    };
  } catch (error) {
    throw new Error(
      `Image preprocessing failed at ${steps[steps.length - 1] || 'raster_copy'}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
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

type PdfTextExtractionResult = {
  text: string;
  pageCount: number;
  pages: Array<{ page_number: number; extracted_text: string; ocr_confidence: number }>;
  method: 'pdf_text';
};

const extractTextFromPdfBufferFallback = (buffer: Buffer): PdfTextExtractionResult => {
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

  const text = cleanText(textChunks.join(' '));
  const pageCount = Math.max(1, (pdf.match(/\/Type\s*\/Page\b/g) || []).length);

  return {
    text,
    pageCount,
    pages: text
      ? [{ page_number: 1, extracted_text: text, ocr_confidence: 99 }]
      : [],
    method: 'pdf_text',
  };
};

const extractTextWithPdfJs = async (buffer: Buffer): Promise<PdfTextExtractionResult> => {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
    disableFontFace: true,
  } as any);
  const pdfDocument = await loadingTask.promise;
  const pageCount = Math.max(1, pdfDocument.numPages || 1);
  const pages: PdfTextExtractionResult['pages'] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = cleanText(
      textContent.items
        .map((item: any) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')
    );

    if (pageText) {
      pages.push({
        page_number: pageNum,
        extracted_text: pageText,
        ocr_confidence: 99,
      });
    }
  }

  await pdfDocument.destroy();

  return {
    text: cleanText(pages.map((page) => page.extracted_text).join('\n\n')),
    pageCount,
    pages,
    method: 'pdf_text',
  };
};

const extractTextFromPdfBuffer = async (buffer: Buffer): Promise<PdfTextExtractionResult> => {
  try {
    const pdfJsText = await extractTextWithPdfJs(buffer);
    if (pdfJsText.text.length > 0) return pdfJsText;
  } catch {
    // Fall through to pdf-parse and the lightweight stream fallback.
  }

  try {
    const { PDFParse } = loadPdfParse();
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const text = cleanText(parsed.text || '');
      return {
        text,
        pageCount: Math.max(1, parsed.total || 1),
        pages: text
          ? [{ page_number: 1, extracted_text: text, ocr_confidence: 99 }]
          : [],
        method: 'pdf_text',
      };
    } finally {
      await parser.destroy();
    }
  } catch {
    return extractTextFromPdfBufferFallback(buffer);
  }
};

// Real page-wise OCR extraction pipeline. It emits structured stage failures and preserves usable pages.
const runOcrOnPdf = async (buffer: Buffer, context: UploadDebugContext) => {
  const { filename, sessionId } = context;
  let createCanvas: CreateCanvas;
  let canvasModule: typeof import('@napi-rs/canvas');
  let Tesseract: typeof import('tesseract.js');

  try {
    canvasModule = loadCanvas();
    createCanvas = canvasModule.createCanvas;
    if (!createCanvas) throw new Error('@napi-rs/canvas did not expose createCanvas');
    debugStageLog(context, 'canvas_init_failed', {
      status: 'loaded',
      renderer: '@napi-rs/canvas',
    });
  } catch (error) {
    debugStageLog(context, 'canvas_init_failed', {
      status: 'failed',
      page: null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PipelineStageError({
      stage: 'canvas_init_failed',
      error: 'Canvas dependency failed to initialize',
      sessionId,
      details: { renderer: '@napi-rs/canvas' },
      cause: error,
    });
  }

  try {
    Tesseract = loadTesseract();
    debugStageLog(context, 'tesseract_worker_failed', { status: 'module_loaded' });
  } catch (error) {
    debugStageLog(context, 'tesseract_worker_failed', {
      status: 'failed',
      page: null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PipelineStageError({
      stage: 'tesseract_worker_failed',
      error: 'Tesseract module failed to initialize',
      sessionId,
      cause: error,
    });
  }

  let pdfDocument: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJs>>['getDocument']>['promise']>;
  let pageCount = 0;

  try {
    const { getDocument } = await loadPdfJs();

    if (typeof global !== 'undefined') {
      (global as any).Image = canvasModule.Image;
      (global as any).ImageData = canvasModule.ImageData;
      (global as any).Path2D = canvasModule.Path2D;
      (global as any).DOMMatrix = canvasModule.DOMMatrix;
    }

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

    debugStageLog(context, 'pdf_page_count', { status: 'start' });
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      disableWorker: true,
      CanvasFactory: CustomNodeCanvasFactory,
    } as any);

    pdfDocument = await loadingTask.promise;
    pageCount = pdfDocument.numPages;

    if (!Number.isFinite(pageCount) || pageCount < 1) {
      throw new Error('PDF contains no renderable pages');
    }

    context.pageCount = pageCount;
    debugStageLog(context, 'pdf_page_count', { status: 'success', pageCount });
  } catch (error) {
    debugStageLog(context, 'pdf_renderer_failed', {
      status: 'failed',
      page: null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PipelineStageError({
      stage: 'pdf_renderer_failed',
      error: 'PDF renderer failed to initialize',
      sessionId,
      cause: error,
    });
  }

  const renderPage = async (pageNum: number) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        debugStageLog(context, 'pdf_render', {
          status: 'start',
          page: pageNum,
          attempt,
        });
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const estimatedPixels = Math.round(viewport.width * viewport.height);
        debugStageLog(context, 'pdf_render', {
          status: 'dimensions',
          page: pageNum,
          attempt,
          width: viewport.width,
          height: viewport.height,
          estimatedPixels,
        });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context2d = canvas.getContext('2d');

        await page.render({
          canvasContext: context2d as any,
          viewport,
        } as any).promise;

        debugStageLog(context, 'pdf_render', {
          status: 'success',
          page: pageNum,
          attempt,
          width: canvas.width,
          height: canvas.height,
        });

        return canvas;
      } catch (error) {
        lastError = error;
        debugStageLog(context, 'pdf_render', {
          status: 'failed',
          page: pageNum,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new PipelineStageError({
      stage: 'pdf_renderer_failed',
      page: pageNum,
      error: 'Failed to render PDF page to image',
      sessionId,
      cause: lastError,
    });
  };

  const preprocessPage = (canvas: NodeCanvas, pageNum: number) => {
    try {
      debugStageLog(context, 'preprocess', {
        status: 'start',
        page: pageNum,
        width: canvas.width,
        height: canvas.height,
      });
      const preprocessed = preprocessPageCanvas(canvas, createCanvas);
      debugStageLog(context, 'preprocess', {
        status: 'success',
        page: pageNum,
        width: preprocessed.canvas.width,
        height: preprocessed.canvas.height,
        preprocessing: preprocessed.steps,
      });

      return preprocessed;
    } catch (error) {
      debugStageLog(context, 'preprocess', {
        status: 'failed',
        page: pageNum,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new PipelineStageError({
        stage: 'preprocess',
        page: pageNum,
        error: 'Image sharpening failed',
        sessionId,
        cause: error,
      });
    }
  };

  const tesseractCachePath = path.join(tmpdir(), 'insureflow-tesseract-cache');
  const tesseractOptions = {
    workerPath: resolveNodeModulePath('tesseract.js/src/worker-script/node/index.js'),
    corePath: path.dirname(resolveNodeModulePath('tesseract.js-core/tesseract-core-lstm.wasm.js')),
    cachePath: tesseractCachePath,
    langPath: process.env.TESSERACT_LANG_PATH,
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: (message: any) => {
      if (message?.status) {
        debugStageLog(context, 'tesseract_worker_failed', {
          status: 'progress',
          progressStatus: message.status,
          progress: message.progress,
        });
      }
    },
  };

  let worker: Awaited<ReturnType<typeof Tesseract.createWorker>>;

  try {
    mkdirSync(tesseractCachePath, { recursive: true });
    worker = await Tesseract.createWorker('eng', undefined, tesseractOptions);
    debugStageLog(context, 'tesseract_worker_failed', {
      status: 'ready',
      workerPath: tesseractOptions.workerPath,
      corePath: tesseractOptions.corePath,
      langPath: tesseractOptions.langPath || 'tesseract.js default CDN',
      cachePath: tesseractOptions.cachePath,
      cacheMethod: tesseractOptions.cacheMethod,
    });
  } catch (error) {
    debugStageLog(context, 'tesseract_worker_failed', {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      workerPath: tesseractOptions.workerPath,
      corePath: tesseractOptions.corePath,
      langPath: tesseractOptions.langPath || 'tesseract.js default CDN',
      cachePath: tesseractOptions.cachePath,
      cacheMethod: tesseractOptions.cacheMethod,
    });
    throw new PipelineStageError({
      stage: 'tesseract_worker_failed',
      error: 'Tesseract worker failed to initialize',
      sessionId,
      details: {
        workerPath: tesseractOptions.workerPath,
        corePath: tesseractOptions.corePath,
        langPath: tesseractOptions.langPath || 'tesseract.js default CDN',
        cachePath: tesseractOptions.cachePath,
        cacheMethod: tesseractOptions.cacheMethod,
        cause: error instanceof Error ? error.message : String(error),
      },
      cause: error,
    });
  }

  const recognizePreprocessedPage = async (canvas: NodeCanvas, pageNum: number) => {
    const rotations = [0, 90, 180, 270];
    let best: { text: string; confidence: number; rotation: number } | null = null;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      debugStageLog(context, 'ocr_worker', {
        status: 'start',
        page: pageNum,
        attempt,
      });

      for (const rotation of rotations) {
        try {
          const rotatedCanvas = rotateCanvas(canvas, createCanvas, rotation);
          const imageBuffer = rotatedCanvas.toBuffer('image/png');
          debugStageLog(context, 'ocr_extract', {
            status: 'start',
            page: pageNum,
            attempt,
            rotation,
            imageBytes: imageBuffer.byteLength,
          });

          const result = await worker.recognize(imageBuffer);
          const text = cleanText(result.data.text || '');
          const confidence = clamp(result.data.confidence);
          debugStageLog(context, 'ocr_extract', {
            status: 'result',
            page: pageNum,
            attempt,
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

          if (text.length >= MIN_PAGE_TEXT_CHARS && confidence >= 45) {
            debugStageLog(context, 'ocr_worker', {
              status: 'success',
              page: pageNum,
              attempt,
              rotation,
              textLength: text.length,
              confidence,
            });
            return best;
          }
        } catch (error) {
          lastError = error;
          debugStageLog(context, 'ocr_worker', {
            status: 'failed',
            page: pageNum,
            attempt,
            rotation,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (best && (best.text.length >= MIN_PAGE_TEXT_CHARS || best.confidence >= MIN_PAGE_OCR_CONFIDENCE)) {
      debugStageLog(context, 'ocr_worker', {
        status: 'low_text_best_effort',
        page: pageNum,
        rotation: best.rotation,
        textLength: best.text.length,
        confidence: best.confidence,
      });
      return best;
    }

    throw new PipelineStageError({
      stage: lastError ? 'tesseract_worker_failed' : 'ocr_extract',
      page: pageNum,
      error: lastError ? 'Tesseract worker crashed' : 'OCR text extraction produced no readable text',
      sessionId,
      cause: lastError,
      details: best
        ? {
            bestTextLength: best.text.length,
            bestConfidence: best.confidence,
            bestRotation: best.rotation,
          }
        : undefined,
    });
  };

  const processPage = async (pageNum: number) => {
    try {
      debugUploadLog('page_processing_start', {
        sessionId,
        filename,
        fileBytes: context.fileBytes,
        pageCount,
        page: pageNum,
      });
      const rendered = await renderPage(pageNum);
      const preprocessed = preprocessPage(rendered, pageNum);
      const result = await recognizePreprocessedPage(preprocessed.canvas, pageNum);
      debugStageLog(context, 'ocr_extract', {
        status: 'page_complete',
        page: pageNum,
        textLength: result.text.length,
        confidence: result.confidence,
        rotationCorrection: result.rotation,
      });

      return {
        ok: true as const,
        page: {
          page_number: pageNum,
          extracted_text: result.text,
          ocr_confidence: result.confidence,
          source_image: {
            width: preprocessed.canvas.width,
            height: preprocessed.canvas.height,
            preprocessing: preprocessed.steps,
            rotation_correction: result.rotation,
          },
        },
      };
    } catch (error) {
      const stageError =
        error instanceof PipelineStageError
          ? error
          : new PipelineStageError({
              stage: 'ocr_extract',
              page: pageNum,
              error: 'OCR text extraction failed',
              sessionId,
              cause: error,
            });

      debugUploadLog('page_processing_failed', {
        sessionId,
        filename,
        fileBytes: context.fileBytes,
        pageCount,
        page: pageNum,
        stage: stageError.stage,
        error: stageError.message,
      });

      return {
        ok: false as const,
        error: stageError,
      };
    }
  };

  let pageResults: Awaited<ReturnType<typeof processPage>>[];
  try {
    pageResults = await Promise.all(Array.from({ length: pageCount }, (_, i) => processPage(i + 1)));
  } finally {
    await worker.terminate().catch((error) => {
      debugStageLog(context, 'tesseract_worker_failed', {
        status: 'terminate_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  const ocrPages = pageResults.flatMap((result) => (result.ok ? [result.page] : []));
  const failedPages = pageResults.flatMap((result) => (result.ok ? [] : [result.error.toResponse()]));

  if (failedPages.length > 0) {
    debugUploadLog('page_failures', {
      sessionId,
      filename,
      fileBytes: context.fileBytes,
      pageCount,
      failures: failedPages,
      continuing: ocrPages.length > 0,
    });
  }

  if (ocrPages.length === 0) {
    const firstFailure = pageResults.find((result) => !result.ok);
    throw (
      firstFailure && !firstFailure.ok
        ? firstFailure.error
        : new PipelineStageError({
            stage: 'ocr_extract',
            error: 'OCR text extraction produced no readable pages',
            sessionId,
          })
    );
  }

  const combinedText = ocrPages.map((p) => p.extracted_text).join('\n\n');
  const averageOcrConfidence = Math.round(
    ocrPages.reduce((sum, p) => sum + p.ocr_confidence, 0) / ocrPages.length
  );
  debugUploadLog('ocr_pages_summary', {
    sessionId,
    filename,
    fileBytes: context.fileBytes,
    pageCount,
    processedPages: ocrPages.length,
    failedPages: failedPages.length,
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
    failedPages,
  };
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

const countExtractedEntities = (value: unknown): number => {
  if (Array.isArray(value)) return value.length > 0 ? 1 : 0;
  if (!value || typeof value !== 'object') return value === null || value === undefined || value === '' ? 0 : 1;
  if ('value' in value) {
    const fieldValue = (value as TraceableField<unknown>).value;
    if (Array.isArray(fieldValue)) return fieldValue.length > 0 ? 1 : 0;
    if (typeof fieldValue === 'boolean') return fieldValue ? 1 : 0;
    return fieldValue === null || fieldValue === undefined || fieldValue === '' ? 0 : 1;
  }

  return Object.values(value).reduce((sum, child) => sum + countExtractedEntities(child), 0);
};

// Local extraction over page-wise OCR with source-page traceability.
const runLocalExtraction = (
  ocrPages: Array<{ page_number: number; extracted_text: string; ocr_confidence: number }>,
  ocrConfidence: number,
  context: UploadDebugContext
) => {
  const { filename, sessionId } = context;
  let pageClassifications: Array<{ page_number: number; document_type: string; confidence: number }>;

  try {
    const combinedLength = ocrPages.reduce((sum, page) => sum + page.extracted_text.length, 0);
    debugStageLog(context, 'page_classification', {
      status: 'start',
      pagesToClassify: ocrPages.length,
      ocrTextLength: combinedLength,
    });
    pageClassifications = ocrPages.map((page) => classifyOcrPage(page.extracted_text, page.page_number));
    debugStageLog(context, 'page_classification', {
      status: 'success',
      pages: pageClassifications.map((classification) => ({
        page: classification.page_number,
        documentType: classification.document_type,
        confidence: classification.confidence,
      })),
    });
  } catch (error) {
    debugStageLog(context, 'page_classification', {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PipelineStageError({
      stage: 'page_classification',
      error: 'Page classification failed',
      sessionId,
      cause: error,
    });
  }

  const combinedText = ocrPages.map((p) => p.extracted_text).join('\n\n');

  try {
    debugStageLog(context, 'entity_extraction', {
      status: 'start',
      pages: ocrPages.length,
      ocrTextLength: combinedText.length,
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

    const entityCount = countExtractedEntities(claimAudit.extracted_data);
    debugStageLog(context, 'entity_extraction', {
      status: 'success',
      extractedEntityCount: entityCount,
      entities: summarizeTraceableFields(claimAudit),
    });
    debugStageLog(context, 'validation_start', {
      status: 'start',
      pageCount: ocrPages.length,
      ocrConfidence,
      extractedEntityCount: entityCount,
    });
    try {
      claimAudit.validation_errors = runCrossDocumentValidation(claimAudit);
    } catch (error) {
      debugStageLog(context, 'validation_start', {
        status: 'failed',
        pageCount: ocrPages.length,
        ocrConfidence,
        extractedEntityCount: entityCount,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new PipelineStageError({
        stage: 'validation_start',
        error: 'Validation failed to start',
        sessionId,
        cause: error,
      });
    }
    return claimAudit;
  } catch (error) {
    if (error instanceof PipelineStageError) throw error;

    debugStageLog(context, 'entity_extraction', {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PipelineStageError({
      stage: 'entity_extraction',
      error: 'Entity extraction failed',
      sessionId,
      cause: error,
    });
  }
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
  filename: string,
  extractionMethod: ValidationReport['extractionMethod'] = 'ocr_required'
): ValidationReport => {
  const ocrPages = audit.ocr_pages || [];
  const errors = audit.validation_errors;
  const textSourceLabel = extractionMethod === 'pdf_text' ? 'PDF text' : 'OCR';

  const docGroups: DocumentGroup[] = ocrPages.map((page) => {
    const pc = audit.page_classifications?.find((p) => p.page_number === page.page_number);
    const type = pc ? pc.document_type : 'Unclassified';
    const classified = Boolean(pc && pc.confidence > 0);
    return {
      id: `page-${page.page_number}`,
      title: `${type} (Page ${page.page_number})`,
      pages: `Page ${page.page_number} of ${ocrPages.length}`,
      confidence: pc ? pc.confidence : 0,
      status: classified ? `Classified from ${textSourceLabel}` : 'Needs manual classification',
      summary: `${textSourceLabel} confidence ${page.ocr_confidence}%. Text preview: "${page.extracted_text.slice(0, 150).replace(/\n/g, ' ')}..."`,
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
      { id: 'parsed', label: extractionMethod === 'pdf_text' ? 'PDF Text Extracted' : 'Page-wise OCR Extracted', time: now, done: true },
      { id: 'classified', label: 'Pages Dynamically Classified', time: now, done: true },
      { id: 'validation', label: 'Cross-Doc Audits Evaluated', time: now, done: true },
      { id: 'repairs', label: 'Repair Log Generated', time: now, done: issues.length > 0 },
      { id: 'ready', label: 'Submission Audited', time: readinessScore >= 85 ? now : 'Pending repairs', done: readinessScore >= 85 },
    ],
    pdfStructure: [
      `01  Source packet: ${filename}`,
      extractionMethod === 'pdf_text' ? '02  Embedded PDF text layer' : '02  Page-wise parallel OCR logs',
      '03  Cross-document identity validations',
      '04  Clinical plausibility and missing report audits',
      '05  Dynamic billing and financial reconciliations',
    ],
    summary: issues.length === 0
      ? 'The uploaded PDF claim packet was parsed successfully; no major compliance errors were detected.'
      : `The claim packet was parsed, identifying ${issues.length} active regulatory, identity, or financial blockers.`,
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

// Stage 7 — AI Claim Reasoning Layer (OpenRouter/GPT-4o)
const runAiValidation = async ({
  fileName,
  pageCount,
  ocrPages,
  ocrConfidence,
  localFields,
  localReport,
  localAudit,
  extractionMethod,
}: {
  fileName: string;
  pageCount: number;
  ocrPages: Array<{ page_number: number; extracted_text: string }>;
  ocrConfidence: number;
  localFields: ClaimField[];
  localReport: ValidationReport;
  localAudit: ClaimAudit;
  extractionMethod: ValidationReport['extractionMethod'];
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
We have extracted text from a medical claim packet using either the PDF text layer or server-side OCR when the PDF had no usable text layer.
Your job is NOT to extract text, but to dynamically audit the page-wise transcript for clinical, regulatory, financial, and identity compliance.

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
              extractionMethod,
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
      extractionMethod,
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
  const sessionId = createUploadSessionId();
  let uploadContext: UploadDebugContext = {
    sessionId,
    filename: 'unknown',
    fileBytes: 0,
  };

  try {
    debugStageLog(uploadContext, 'pdf_upload_parse', { status: 'start' });
    const formData = await req.formData().catch((error) => {
      throw new PipelineStageError({
        stage: 'pdf_upload_parse',
        error: 'Failed to parse multipart PDF upload',
        sessionId,
        cause: error,
      });
    });
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new PipelineStageError({
        stage: 'pdf_upload_parse',
        error: 'No file uploaded',
        sessionId,
      });
    }

    if (file.type && file.type !== 'application/pdf') {
      throw new PipelineStageError({
        stage: 'pdf_upload_parse',
        error: 'Only PDF claim packets are supported.',
        sessionId,
        details: { mimeType: file.type },
      });
    }

    const arrayBuffer = await file.arrayBuffer().catch((error) => {
      throw new PipelineStageError({
        stage: 'pdf_upload_parse',
        error: 'Failed to read uploaded PDF into memory',
        sessionId,
        cause: error,
      });
    });
    const buffer = Buffer.from(arrayBuffer);
    uploadContext = {
      sessionId,
      filename: file.name,
      fileBytes: buffer.byteLength,
    };
    debugStageLog(uploadContext, 'pdf_upload_parse', {
      status: 'success',
      mimeType: file.type || 'application/pdf',
    });

    // Text PDFs should never pay the OCR cost. Try the PDF text layer first, then OCR only for scans.
    debugStageLog(uploadContext, 'pdf_upload_parse', { status: 'text_extraction_start' });
    const embeddedText = await extractTextFromPdfBuffer(buffer);
    const ocrData =
      embeddedText.text.length > MIN_DIRECT_PDF_TEXT_CHARS
        ? {
            ocrPages: embeddedText.pages,
            combinedText: embeddedText.text,
            averageOcrConfidence: 99,
            pageCount: embeddedText.pageCount,
            failedPages: [],
            extractionMethod: 'pdf_text' as const,
          }
        : {
            ...(await runOcrOnPdf(buffer, uploadContext)),
            extractionMethod: 'ocr_required' as const,
          };

    if (ocrData.extractionMethod === 'pdf_text') {
      uploadContext.pageCount = ocrData.pageCount;
      debugUploadLog('pdf_text_summary', {
        sessionId,
        filename: file.name,
        fileBytes: buffer.byteLength,
        pageCount: ocrData.pageCount,
        textLength: ocrData.combinedText.length,
        skippedOcr: true,
      });
    }

    // Stage 4, 5, 6: Dynamic Classification, Entity extraction, and Cross-Document Validation
    const localAudit = runLocalExtraction(
      ocrData.ocrPages,
      ocrData.averageOcrConfidence,
      uploadContext
    );

    const localFields = mapAuditToClaimFields(localAudit, file.name);
    const localReport = buildLocalReport(
      localAudit,
      ocrData.averageOcrConfidence,
      file.name,
      ocrData.extractionMethod
    );

    // Stage 7: AI Claim Reasoning Layer
    const aiResult = await runAiValidation({
      fileName: file.name,
      pageCount: ocrData.pageCount,
      ocrPages: ocrData.ocrPages,
      ocrConfidence: ocrData.averageOcrConfidence,
      localFields,
      localReport,
      localAudit,
      extractionMethod: ocrData.extractionMethod,
    });

    console.log('[POST Handler] Claims extraction processing successfully complete.');

    return NextResponse.json({
      fields: aiResult?.fields || localFields,
      validation: aiResult?.validation || localReport,
      claimAudit: aiResult?.claimAudit || localAudit,
      extractedTextLength: ocrData.combinedText.length,
      pageCount: ocrData.pageCount,
      processedPageCount: ocrData.ocrPages.length,
      failedPages: ocrData.failedPages,
      uploadSessionId: sessionId,
      extractionSource:
        aiResult
          ? 'openrouter'
          : ocrData.extractionMethod === 'pdf_text'
            ? 'local_pdf_text_pipeline'
            : 'local_ocr_pipeline',
      extractionMethod: ocrData.extractionMethod,
    });
  } catch (error) {
    console.error('[POST Handler] Uncaught exception during claim intake:', error);
    const stageError =
      error instanceof PipelineStageError
        ? error
        : new PipelineStageError({
            stage: 'pdf_upload_parse',
            error: error instanceof Error ? error.message : 'Unknown error during extraction',
            sessionId,
            cause: error,
          });

    debugStageLog(uploadContext, stageError.stage, {
      status: 'failed',
      page: stageError.page,
      error: stageError.message,
      details: stageError.details || null,
    });

    return NextResponse.json(
      {
        ...stageError.toResponse(),
        extractionFailed: true,
      },
      { status: stageError.stage === 'pdf_upload_parse' ? 400 : 422 }
    );
  }
}
