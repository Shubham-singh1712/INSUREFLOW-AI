/**
 * Test script: simulate exactly what the Next.js API route does with OCR
 * Run: node test-ocr.mjs
 */
import { createWorker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Polyfill globalThis like the pipeline does
const canvas = await import('@napi-rs/canvas');
globalThis.DOMMatrix ||= canvas.DOMMatrix;
globalThis.ImageData ||= canvas.ImageData;
globalThis.Path2D ||= canvas.Path2D;

// Load the PDF
const pdfPath = 'c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/sample-pdfs/PREAUTH OF OF PT  PAVAN YADAV.pdf';
const buffer = fs.readFileSync(pdfPath);

console.log('PDF buffer size:', buffer.length, 'bytes');

// Render page 1 like the pipeline does
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(buffer),
  disableWorker: true,
  useSystemFonts: true,
});

const document = await loadingTask.promise;
console.log('PDF loaded, pages:', document.numPages);

const page = await document.getPage(1);
const viewport = page.getViewport({ scale: 1.7 });
const { Canvas } = await import('@napi-rs/canvas');
const cvs = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const context = cvs.getContext('2d');
await page.render({ canvasContext: context, viewport }).promise;
const imageBuffer = await cvs.toBuffer('image/png');
console.log('Rendered page 1 to PNG, size:', imageBuffer.length, 'bytes');

// Write to tmp to check it
fs.writeFileSync('/tmp/test_page1.png', imageBuffer);
console.log('Saved to /tmp/test_page1.png');

// Now OCR it
console.log('Starting Tesseract worker...');
let worker;
try {
  worker = await createWorker('eng', 1);
  console.log('Worker created OK');
  const result = await worker.recognize(imageBuffer);
  console.log('OCR confidence:', result.data.confidence);
  console.log('OCR text (first 400):', result.data.text.substring(0, 400));
  await worker.terminate();
} catch (err) {
  console.error('OCR FAILED:', err.message);
  if (worker) await worker.terminate().catch(() => {});
}

await document.destroy();
console.log('Done.');
