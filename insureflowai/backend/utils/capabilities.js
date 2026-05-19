const capabilities = {
  pdf_text_available: false,
  pdf_render_available: false,
  canvas_available: false,
  ocr_available: false,
};

const checkCapabilities = async () => {
  // Check PDF parsing (text-layer)
  try {
    require.resolve('pdf-parse');
    capabilities.pdf_text_available = true;
  } catch (e) {
    console.warn('⚠️ PDF text extraction capability is missing.');
  }

  // Check PDF rendering
  try {
    require.resolve('pdfjs-dist');
    capabilities.pdf_render_available = true;
  } catch (e) {
    console.warn('⚠️ PDF rendering capability is missing.');
  }

  // Check Canvas (needed for advanced PDF rendering or some OCR pipelines)
  try {
    require.resolve('canvas');
    capabilities.canvas_available = true;
  } catch (e) {
    console.warn('⚠️ Canvas capability is missing.');
  }

  // Check OCR
  try {
    require.resolve('tesseract.js');
    capabilities.ocr_available = true;
  } catch (e) {
    console.warn('⚠️ OCR capability is missing.');
  }

  return capabilities;
};

module.exports = {
  capabilities,
  checkCapabilities,
};
