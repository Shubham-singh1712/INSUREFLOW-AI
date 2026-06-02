const express = require('express');
const pdfController = require('../controllers/pdf.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { claimWorkflowValidator } = require('../validators/workflow.validator');

const router = express.Router();

router.post('/master-pdf', protect, claimWorkflowValidator, validateRequest, pdfController.masterPdf);

module.exports = router;
