#!/usr/bin/env python3
"""
ocr_pdf.py  — Production PDF OCR script for INSUREFLOW-AI
=========================================================
Takes a PDF file path as argument, renders each page with PyMuPDF (fitz),
OCRs it with Tesseract, and returns structured JSON with per-page text.

Usage:
    python ocr_pdf.py <pdf_path> [--scale 2.0] [--lang eng]

Output (stdout): JSON
    {
      "pages": [
        { "page": 1, "text": "...", "confidence": 87 },
        ...
      ],
      "page_count": 11,
      "total_chars": 4821
    }

Stderr: logging only (ignored by Node bridge)
"""

import sys
import os
import json
import argparse
import base64
import tempfile

# ── Argument parsing ────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description='OCR a PDF file using PyMuPDF + Tesseract.js bridge')
parser.add_argument('pdf_path', help='Absolute path to the PDF file')
parser.add_argument('--scale', type=float, default=2.0, help='Render scale factor (default: 2.0)')
parser.add_argument('--lang', type=str, default='eng', help='Tesseract language (default: eng)')
parser.add_argument('--pages', type=str, default='all', help='Pages to OCR: "all" or "1,2,3"')
args = parser.parse_args()

def log(msg):
    print(f'[ocr_pdf] {msg}', file=sys.stderr)

# ── Import PyMuPDF ───────────────────────────────────────────────────────────
try:
    import fitz  # PyMuPDF
    log(f'PyMuPDF version: {fitz.__version__}')
except ImportError:
    print(json.dumps({'error': 'PyMuPDF (fitz) not installed. Run: pip install pymupdf'}))
    sys.exit(1)

# ── Import Tesseract ─────────────────────────────────────────────────────────────────────────────
# Try pytesseract first, fall back to tesserocr, then subprocess tesseract
tesseract_backend = None
TESS_CMD = None  # will be set if we find tesseract binary

def find_tesseract_binary():
    """Auto-detect tesseract binary on Windows and Linux."""
    import shutil, platform
    # 1. Already in PATH?
    found = shutil.which('tesseract')
    if found:
        return found
    # 2. Common Windows install locations
    if platform.system() == 'Windows':
        candidates = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            os.path.expanduser(r'~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'),
            os.path.expanduser(r'~\AppData\Local\Tesseract-OCR\tesseract.exe'),
            r'C:\tools\tesseract\tesseract.exe',
            r'C:\ProgramData\chocolatey\bin\tesseract.exe',
            r'C:\Users\Public\tesseract\tesseract.exe',
        ]
        # Also search Scoop
        scoop_base = os.path.expanduser(r'~\scoop\apps\tesseract')
        if os.path.isdir(scoop_base):
            for ver in os.listdir(scoop_base):
                p = os.path.join(scoop_base, ver, 'tesseract.exe')
                candidates.append(p)
        for p in candidates:
            if os.path.isfile(p):
                return p
    return None

tess_binary = find_tesseract_binary()
if tess_binary:
    log(f'Found Tesseract binary: {tess_binary}')
    TESS_CMD = tess_binary
else:
    log('WARNING: Tesseract binary not found in any known location')

try:
    import pytesseract
    from PIL import Image
    import io
    if TESS_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESS_CMD
    pytesseract.get_tesseract_version()
    tesseract_backend = 'pytesseract'
    log(f'Backend: pytesseract (binary: {TESS_CMD or "in PATH"})')
except Exception as e:
    log(f'pytesseract not available: {e}')

if not tesseract_backend and TESS_CMD:
    try:
        import subprocess as _sub
        r = _sub.run([TESS_CMD, '--version'], capture_output=True, timeout=5)
        if r.returncode == 0:
            tesseract_backend = 'subprocess'
            log('Backend: tesseract subprocess')
    except Exception as e:
        log(f'tesseract subprocess not available: {e}')

if not tesseract_backend:
    # No tesseract available — use PyMuPDF's built-in text extraction as last resort
    # (won't work for pure scanned images but catches semi-scanned PDFs)
    tesseract_backend = 'fitz_text'
    log('WARNING: No Tesseract available. Using PyMuPDF text extraction (image PDFs will get no text).')

# ── OCR functions ────────────────────────────────────────────────────────────

def ocr_pixmap_pytesseract(pix, lang):
    """OCR a PyMuPDF Pixmap using pytesseract."""
    img_data = pix.tobytes('png')
    img = Image.open(io.BytesIO(img_data))
    # Run pytesseract with confidence output
    result = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    text = pytesseract.image_to_string(img, lang=lang)
    # Calculate average confidence from non-empty words
    confidences = [int(c) for c, w in zip(result['conf'], result['text'])
                   if str(c).lstrip('-').isdigit() and int(c) >= 0 and str(w).strip()]
    avg_conf = int(sum(confidences) / len(confidences)) if confidences else 0
    return text.strip(), avg_conf

def ocr_pixmap_subprocess(pix, lang, page_num):
    """OCR a PyMuPDF Pixmap using tesseract subprocess via temp file."""
    import subprocess
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        tmp_path = f.name
        f.write(pix.tobytes('png'))
    try:
        out_base = tmp_path.replace('.png', '')
        cmd = TESS_CMD or 'tesseract'
        # Run tesseract to TSV for confidence, and txt for text
        subprocess.run(
            [cmd, tmp_path, out_base, '-l', lang, 'tsv', 'txt'],
            capture_output=True, timeout=60
        )
        txt_path = out_base + '.txt'
        tsv_path = out_base + '.tsv'
        text = open(txt_path).read().strip() if os.path.exists(txt_path) else ''
        # Parse TSV for confidence
        avg_conf = 0
        if os.path.exists(tsv_path):
            import csv
            confidences = []
            with open(tsv_path) as f:
                reader = csv.DictReader(f, delimiter='\t')
                for row in reader:
                    try:
                        c = int(row.get('conf', -1))
                        w = row.get('text', '').strip()
                        if c >= 0 and w:
                            confidences.append(c)
                    except:
                        pass
            avg_conf = int(sum(confidences) / len(confidences)) if confidences else 0
        return text, avg_conf
    finally:
        for ext in ['.png', '.txt', '.tsv']:
            try: os.unlink(out_base + ext)
            except: pass

def ocr_fitz_text(page):
    """Fallback: use PyMuPDF's built-in text extraction."""
    text = page.get_text('text').strip()
    return text, 70 if text else 0

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    pdf_path = args.pdf_path
    scale = args.scale
    lang = args.lang

    if not os.path.exists(pdf_path):
        print(json.dumps({'error': f'PDF not found: {pdf_path}'}))
        sys.exit(1)

    log(f'Opening PDF: {pdf_path}')
    doc = fitz.open(pdf_path)
    page_count = doc.page_count
    log(f'Total pages: {page_count}')

    # Determine which pages to process
    if args.pages == 'all':
        page_indices = list(range(page_count))
    else:
        page_indices = [int(p) - 1 for p in args.pages.split(',') if p.strip().isdigit()]

    results = []
    total_chars = 0

    for i in page_indices:
        if i < 0 or i >= page_count:
            continue
        page = doc[i]
        page_num = i + 1
        log(f'Processing page {page_num}/{page_count}...')

        # Render page to pixmap at given scale
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        try:
            if tesseract_backend == 'pytesseract':
                text, confidence = ocr_pixmap_pytesseract(pix, lang)
            elif tesseract_backend == 'subprocess':
                text, confidence = ocr_pixmap_subprocess(pix, lang, page_num)
            else:
                text, confidence = ocr_fitz_text(page)
        except Exception as e:
            log(f'OCR error on page {page_num}: {e}')
            text, confidence = '', 0

        total_chars += len(text)
        log(f'  Page {page_num}: {len(text)} chars, confidence={confidence}%')
        if text:
            log(f'  Preview: {text[:120].replace(chr(10), " ")}')

        results.append({
            'page': page_num,
            'text': text,
            'confidence': confidence,
        })

    doc.close()

    output = {
        'pages': results,
        'page_count': page_count,
        'total_chars': total_chars,
        'backend': tesseract_backend,
    }

    # Write JSON to stdout (Node.js reads this)
    print(json.dumps(output, ensure_ascii=False))
    log('Done.')

if __name__ == '__main__':
    main()
