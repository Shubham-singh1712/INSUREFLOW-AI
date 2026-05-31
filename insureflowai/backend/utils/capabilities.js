const checkCapabilities = async () => {
  return {
    pdf_text_available: true,
    pdf_render_available: false,
    canvas_available: false,
    ocr_available: false
  };
};

module.exports = { checkCapabilities };
