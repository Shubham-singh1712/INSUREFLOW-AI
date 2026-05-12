const Document = require('../models/Document');
const ApiError = require('../utils/ApiError');

const getDocumentById = async (id, user) => {
  const document = await Document.findById(id).populate('claim');
  if (!document) throw new ApiError(404, 'Document not found.');

  if (document.claim && document.claim.hospitalName !== user.hospitalName) {
    throw new ApiError(403, 'You do not have access to this document.');
  }

  return document;
};

module.exports = { getDocumentById };
