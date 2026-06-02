import { PageText } from './types';

/**
 * Placeholder file. Deprecated runOcrFallback.
 * OCR rendering is now handled by PyMuPDF in ocr_worker.mjs subprocess.
 */
export async function runOcrFallback(
  _buffer: Buffer,
  _pageCount: number
): Promise<PageText[]> {
  throw new Error('runOcrFallback is deprecated. Use runOcrWorkerSubprocess instead.');
}
