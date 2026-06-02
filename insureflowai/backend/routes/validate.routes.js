const express = require('express');
const validationController = require('../controllers/validation.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { claimWorkflowValidator } = require('../validators/workflow.validator');

const router = express.Router();

router.post('/claim', protect, claimWorkflowValidator, validateRequest, validationController.validate);

module.exports = router;
