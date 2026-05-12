const express = require('express');
const authRoutes = require('./auth.routes');
const claimRoutes = require('./claim.routes');
const uploadRoutes = require('./upload.routes');
const documentRoutes = require('./document.routes');
const ocrRoutes = require('./ocr.routes');
const validateRoutes = require('./validate.routes');
const detectRoutes = require('./detect.routes');
const pdfRoutes = require('./pdf.routes');
const analyticsRoutes = require('./analytics.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/claims', claimRoutes);
router.use('/upload', uploadRoutes);
router.use('/documents', documentRoutes);
router.use('/ocr', ocrRoutes);
router.use('/validate', validateRoutes);
router.use('/detect', detectRoutes);
router.use('/generate', pdfRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
