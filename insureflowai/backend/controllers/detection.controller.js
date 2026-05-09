const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { detectSignature, detectBlur } = require('../services/detection.service');

const signature = asyncHandler(async (req, res) => {
  const result = await detectSignature({
    documentId: req.body.documentId,
    claimId: req.body.claimId,
    user: req.user,
  });

  return sendSuccess(res, 200, 'Signature detection completed.', result);
});

const blur = asyncHandler(async (req, res) => {
  const result = await detectBlur({
    documentId: req.body.documentId,
    claimId: req.body.claimId,
    user: req.user,
  });

  return sendSuccess(res, 200, 'Blur detection completed.', result);
});

module.exports = { signature, blur };
