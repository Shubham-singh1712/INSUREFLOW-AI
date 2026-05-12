const express = require('express');
const detectionController = require('../controllers/detection.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { documentWorkflowValidator } = require('../validators/workflow.validator');

const router = express.Router();

router.post('/signature', protect, documentWorkflowValidator, validateRequest, detectionController.signature);
router.post('/blur', protect, documentWorkflowValidator, validateRequest, detectionController.blur);

module.exports = router;
