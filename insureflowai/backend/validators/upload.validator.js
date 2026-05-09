const { body, param } = require('express-validator');
const { ALLOWED_DOCUMENT_TYPES } = require('../constants/documentTypes');

const uploadDocumentsValidator = [
  body('documentType').isIn(ALLOWED_DOCUMENT_TYPES).withMessage('Unsupported document type.'),
  body('claimId').optional().isMongoId().withMessage('Claim ID must be valid.'),
];

const documentIdValidator = [param('id').isMongoId().withMessage('Valid document ID is required.')];

module.exports = { uploadDocumentsValidator, documentIdValidator };
