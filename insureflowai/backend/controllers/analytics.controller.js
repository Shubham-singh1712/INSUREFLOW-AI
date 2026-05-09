const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { getDashboardSummary } = require('../services/analytics.service');

const dashboard = asyncHandler(async (req, res) => {
  const summary = await getDashboardSummary(req.user);
  return sendSuccess(res, 200, 'Dashboard summary loaded.', summary);
});

module.exports = { dashboard };
