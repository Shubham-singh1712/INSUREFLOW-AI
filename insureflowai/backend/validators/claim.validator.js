const { body, param } = require('express-validator');
const { CLAIM_STATUS } = require('../constants/statuses');

const createClaimValidator = [
  body('patientName').trim().notEmpty().withMessage('Patient name is required.'),
  body('patientId').trim().notEmpty().withMessage('Patient ID is required.'),
  body('insuranceProvider').trim().notEmpty().withMessage('Insurance provider is required.'),
  body('diagnosis').trim().notEmpty().withMessage('Diagnosis is required.'),
  body('procedure').trim().notEmpty().withMessage('Procedure is required.'),
];

const claimIdValidator = [param('id').isMongoId().withMessage('Valid claim ID is required.')];

const updateClaimStatusValidator = [
  ...claimIdValidator,
  body('status').isIn(Object.values(CLAIM_STATUS)).withMessage('Invalid claim status.'),
];

module.exports = { createClaimValidator, claimIdValidator, updateClaimStatusValidator };
