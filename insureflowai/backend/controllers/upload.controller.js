const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const uploadService = require('../services/upload.service');

const uploadDocuments = asyncHandler(async (req, res) => {
  const documents = await uploadService.uploadDocuments({
    files: req.files,
    claimId: req.body.claimId,
    documentType: req.body.documentType,
    user: req.user,
  });

  return sendSuccess(res, 201, 'Documents uploaded successfully.', { documents });
});

module.exports = { uploadDocuments };
