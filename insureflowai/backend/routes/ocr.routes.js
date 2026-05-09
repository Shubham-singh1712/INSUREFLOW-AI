const express = require('express');
const ocrController = require('../controllers/ocr.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { documentWorkflowValidator } = require('../validators/workflow.validator');

const router = express.Router();

router.post('/extract', protect, documentWorkflowValidator, validateRequest, ocrController.extract);

module.exports = router;
