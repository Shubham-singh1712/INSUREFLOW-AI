const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, '..', 'sample-pdfs', 'PREAUTH OF OF PT  PAVAN YADAV.pdf');
console.log('PDF Path:', pdfPath);
console.log('Exists:', fs.existsSync(pdfPath));

async function run() {
  const buffer = fs.readFileSync(pdfPath);
  
  // Try standard pdf-parse first
  console.log('--- Trying pdf-parse ---');
  try {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    console.log('Parsed text length:', parsed.text?.length);
    console.log('Parsed numpages:', parsed.numpages);
    console.log('Sample text:', JSON.stringify(parsed.text?.slice(0, 200)));
  } catch (err) {
    console.error('pdf-parse error:', err);
  }

  // Try OCR flow
  console.log('--- Trying OCR flow ---');
  try {
    const { Canvas } = require('@napi-rs/canvas');
    const Tesseract = require('tesseract.js');
    console.log('Canvas and Tesseract imported');

    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    console.log('pdfjsLib imported');

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdfDocument = await loadingTask.promise;
    console.log('PDF loaded, page count:', pdfDocument.numPages);

    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = new Canvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    console.log('Page rendered to canvas');

    const imageBuffer = await canvas.toBuffer('image/png');
    console.log('Image buffer generated, size:', imageBuffer.length);

    console.log('Starting Tesseract recognize...');
    const result = await Tesseract.recognize(imageBuffer, 'eng');
    console.log('OCR Complete. Text length:', result.data.text?.length);
    console.log('OCR Text sample:', JSON.stringify(result.data.text?.slice(0, 200)));
  } catch (err) {
    console.error('OCR flow error:', err);
  }
}

run();
