const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const documentService = require('../services/document.service');

const getDocument = asyncHandler(async (req, res) => {
  const document = await documentService.getDocumentById(req.params.id, req.user);
  return sendSuccess(res, 200, 'Document loaded successfully.', { document });
});

module.exports = { getDocument };
