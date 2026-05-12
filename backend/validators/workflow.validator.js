const { body } = require('express-validator');

const claimWorkflowValidator = [
  body('claimId').isMongoId().withMessage('Valid claim ID is required.'),
];

const documentWorkflowValidator = [
  body('documentId').isMongoId().withMessage('Valid document ID is required.'),
  body('claimId').optional().isMongoId().withMessage('Claim ID must be valid.'),
];

module.exports = { claimWorkflowValidator, documentWorkflowValidator };
