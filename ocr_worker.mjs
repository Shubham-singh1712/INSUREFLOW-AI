/**
 * ocr_worker.mjs — Node.js OCR worker for INSUREFLOW-AI
 * =====================================================
 * Strategy: PyMuPDF renders pages → temp PNG files → Tesseract.js reads the files.
 * This avoids the @napi-rs/canvas segfault when pdfjs tries canvas.drawImage(canvas).
 *
 * Usage:  node ocr_worker.mjs <pdfPath>
 * Output: JSON on stdout  { pages: [{page, text, confidence}], page_count, total_chars }
 * Stderr: log lines
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(...args) { process.stderr.write('[ocr_worker] ' + args.join(' ') + '\n'); }

// ── Step 1: Validate args ────────────────────────────────────────────────────
const pdfPath = process.argv[2];
const customTempDir = process.argv[3];
const ocrEnabled = process.argv[4] !== 'false';

if (!pdfPath) {
  process.stdout.write(JSON.stringify({ error: 'Usage: node ocr_worker.mjs <pdfPath> [customTempDir] [ocrEnabled]' }));
  process.exit(1);
}
if (!fs.existsSync(pdfPath)) {
  process.stdout.write(JSON.stringify({ error: `File not found: ${pdfPath}` }));
  process.exit(1);
}

// ── Step 2: Use Python/PyMuPDF to render all pages to temp PNG files ─────────
const tempDir = customTempDir || path.join(os.tmpdir(), `ocr_pages_${Date.now()}`);
fs.mkdirSync(tempDir, { recursive: true });
log('Temp dir:', tempDir);

const renderScript = `
import fitz, sys, os, json
pdf_path = sys.argv[1]
out_dir = sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
doc = fitz.open(pdf_path)
page_count = doc.page_count
pages = []
for i in range(page_count):
    mat = fitz.Matrix(scale, scale)
    pix = doc[i].get_pixmap(matrix=mat, alpha=False)
    img_path = os.path.join(out_dir, f'page_{i+1}.png')
    pix.save(img_path)
    pages.append({'page': i+1, 'path': img_path})
doc.close()
print(json.dumps({'pages': pages, 'page_count': page_count}))
`;

// Write the inline script to a temp file
const renderScriptPath = path.join(tempDir, 'render.py');
fs.writeFileSync(renderScriptPath, renderScript);

log('Rendering pages to PNG via PyMuPDF...');

async function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const commands = ['python', 'python3', 'py'];
    let tried = 0;
    function tryNext() {
      if (tried >= commands.length) return reject(new Error('Python not found'));
      const cmd = commands[tried++];
      const proc = spawn(cmd, [scriptPath, ...args]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; if (d.toString().trim()) log('py:', d.toString().trim()); });
      proc.on('close', code => {
        if (code === 0) resolve(stdout);
        else if (code === null || stderr.includes('not recognized') || stderr.includes('No such file')) tryNext();
        else reject(new Error(`Python failed (${code}): ${stderr.slice(0, 300)}`));
      });
      proc.on('error', () => tryNext());
    }
    tryNext();
  });
}

let pageInfos;
try {
  const renderOutput = await runPython(renderScriptPath, [pdfPath, tempDir, '2.0']);
  const jsonStart = renderOutput.indexOf('{');
  const parsed = JSON.parse(renderOutput.substring(jsonStart));
  pageInfos = parsed.pages;
  log(`PyMuPDF rendered ${pageInfos.length} pages as PNG`);
} catch (err) {
  log('PyMuPDF render FAILED:', err.message);
  // Fall back: try to use @napi-rs/canvas + pdfjs (may crash on scanned PDFs)
  process.stdout.write(JSON.stringify({ error: `PyMuPDF render failed: ${err.message}`, pages: [], page_count: 0, total_chars: 0 }));
  process.exit(0);
}

// ── Step 3: OCR each PNG file with Tesseract.js ───────────────────────────────
const pages = [];
let totalChars = 0;

if (ocrEnabled) {
  log('Initialising Tesseract worker...');
  const { createWorker } = await import('tesseract.js');
  const tessWorker = await createWorker('eng', 1);
  log('Tesseract worker ready');

  for (const pageInfo of pageInfos) {
    const { page, path: imgPath } = pageInfo;
    log(`OCRing page ${page}/${pageInfos.length}: ${imgPath}`);

    if (!fs.existsSync(imgPath)) {
      log(`  PNG not found: ${imgPath}`);
      pages.push({ page, text: '', confidence: 0 });
      continue;
    }

    let text = '';
    let confidence = 0;
    try {
      // Read PNG as buffer — tesseract.js handles file buffers reliably
      const pngBuffer = fs.readFileSync(imgPath);
      const result = await tessWorker.recognize(pngBuffer);
      text = (result?.data?.text ?? '').trim().replace(/[ \t]+/g, ' ');
      confidence = Math.round(result?.data?.confidence ?? 0);
      if (text.length > 0) {
        log(`  ${text.length} chars, confidence=${confidence}%`);
        log(`  Preview: ${text.substring(0, 120).replace(/\n/g, ' ')}`);
      } else {
        log(`  Empty (blank or illegible page)`);
      }
    } catch (ocrErr) {
      log(`  OCR error: ${ocrErr.message}`);
    }

    totalChars += text.length;
    pages.push({ page, text, confidence });
  }

  await tessWorker.terminate();
} else {
  log('OCR disabled. Skipping Tesseract extraction.');
  for (const pageInfo of pageInfos) {
    pages.push({ page: pageInfo.page, text: '', confidence: 0 });
  }
}

// ── Step 4: Cleanup ───────────────────────────────────────────────────────────
if (!customTempDir) {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}
log(`Done. ${totalChars} chars across ${pageInfos.length} pages`);

// ── Step 5: Output JSON ───────────────────────────────────────────────────────
process.stdout.write(JSON.stringify({
  pages,
  page_count: pageInfos.length,
  total_chars: totalChars,
  backend: ocrEnabled ? 'pymupdf+tesseract.js' : 'pymupdf-render-only',
}));
