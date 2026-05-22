import path from 'path';
import { pathToFileURL } from 'url';
import { PageText } from './types';
import { normalizeWhitespace, clamp } from './utils';
import { logger } from './logger';



const OCR_MIN_TEXT_LENGTH = 10;

async function ensurePdfJsNodePolyfills() {
  if (globalThis.DOMMatrix && globalThis.ImageData && globalThis.Path2D) return;

  try {
    const canvas = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ||= canvas.DOMMatrix as typeof globalThis.DOMMatrix;
    globalThis.ImageData ||= canvas.ImageData as typeof globalThis.ImageData;
    globalThis.Path2D ||= canvas.Path2D as typeof globalThis.Path2D;
  } catch (error) {
    throw new Error('Canvas geometry polyfills could not be initialized.');
  }
}

async function loadPdfJs() {
  await ensurePdfJsNodePolyfills();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

export async function runOcrFallback(buffer: Buffer, pageCount: number): Promise<PageText[]> {
  logger.info('OCR', `Starting OCR for ${pageCount} pages`);
  
  let pdfjs: any;
  let Canvas: any;
  let Tesseract: any;

  try {
    pdfjs = await loadPdfJs();
  } catch (error: any) {
    logger.error('OCR', 'Failed to load PDF.js', error);
    throw new Error(`PDF renderer could not be loaded: ${error.message}`);
  }

  try {
    const canvasModule = await import('@napi-rs/canvas');
    Canvas = canvasModule.Canvas as typeof Canvas;
  } catch (error: any) {
    logger.error('OCR', 'Failed to initialize Canvas', error);
    throw new Error(`Canvas renderer could not be initialized: ${error.message}`);
  }

  try {
    const imported = await import('tesseract.js');
    Tesseract = ((imported as any).default || imported) as typeof Tesseract;
  } catch (error: any) {
    logger.error('OCR', 'Failed to initialize Tesseract', error);
    throw new Error(`OCR worker could not be initialized: ${error.message}`);
  }

  let worker: any = null;

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    const pages: PageText[] = [];

    if (typeof Tesseract.createWorker === 'function') {
      worker = await Tesseract.createWorker('eng', Tesseract.OEM?.LSTM_ONLY ?? 1);
    }

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      logger.info('OCR', `Rendering and OCRing page ${pageNumber}`);
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;
      const imageBuffer = await canvas.toBuffer('image/png');
      const result = worker
        ? await worker.recognize(imageBuffer)
        : await Tesseract.recognize?.(imageBuffer, 'eng');
      const cleaned = normalizeWhitespace(result?.data.text || '');

      logger.ocrPreview(pageNumber, cleaned);

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
  } catch (error: any) {
    await worker?.terminate().catch(() => undefined);
    logger.error('OCR', 'OCR extraction failed', error);
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
}
