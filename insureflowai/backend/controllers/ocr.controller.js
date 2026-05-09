const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { runOcrExtraction } = require('../services/ocr.service');

const extract = asyncHandler(async (req, res) => {
  const result = await runOcrExtraction({
    documentId: req.body.documentId,
    claimId: req.body.claimId,
    user: req.user,
  });

  return sendSuccess(res, 200, 'OCR extraction completed.', result);
});

module.exports = { extract };
