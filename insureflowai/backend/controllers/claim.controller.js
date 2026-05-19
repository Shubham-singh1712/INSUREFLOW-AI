const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const claimService = require('../services/claim.service');
const { getClaimActivity } = require('../services/activity.service');
const { getClaimValidationLogs } = require('../services/validationLog.service');

const createClaim = asyncHandler(async (req, res) => {
  const claim = await claimService.createClaim(req.body, req.user);
  return sendSuccess(res, 201, 'Claim created successfully.', { claim });
});

const getAllClaims = asyncHandler(async (req, res) => {
  const claims = await claimService.getClaims(req.query, req.user);
  return sendSuccess(res, 200, 'Claims loaded successfully.', { claims });
});

const getClaim = asyncHandler(async (req, res) => {
  const claim = await claimService.getClaimById(req.params.id, req.user);
  const [activityTimeline, auditLogs] = await Promise.all([
    getClaimActivity(claim._id),
    getClaimValidationLogs(claim._id),
  ]);

  return sendSuccess(res, 200, 'Claim loaded successfully.', { claim, activityTimeline, auditLogs });
});

const updateStatus = asyncHandler(async (req, res) => {
  const claim = await claimService.updateClaimStatus(req.params.id, req.body.status, req.user);
  return sendSuccess(res, 200, 'Claim status updated successfully.', { claim });
});

const deleteClaim = asyncHandler(async (req, res) => {
  const claim = await claimService.deleteClaim(req.params.id, req.user);
  return sendSuccess(res, 200, 'Claim deleted successfully.', { claimId: claim._id });
});

module.exports = { createClaim, getAllClaims, getClaim, updateStatus, deleteClaim };
