const express = require('express');
const uploadController = require('../controllers/upload.controller');
const { protect } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { uploadDocumentsValidator } = require('../validators/upload.validator');

const router = express.Router();

router.post(
  '/documents',
  protect,
  upload.array('documents', 12),
  uploadDocumentsValidator,
  validateRequest,
  uploadController.uploadDocuments
);

module.exports = router;
