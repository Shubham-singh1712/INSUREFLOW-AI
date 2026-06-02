const express = require('express');
const documentController = require('../controllers/document.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { documentIdValidator } = require('../validators/upload.validator');

const router = express.Router();

router.get('/:id', protect, documentIdValidator, validateRequest, documentController.getDocument);

module.exports = router;
