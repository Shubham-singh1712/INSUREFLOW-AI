const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/dashboard', protect, analyticsController.dashboard);
router.get('/stats', protect, analyticsController.dashboard);

module.exports = router;
