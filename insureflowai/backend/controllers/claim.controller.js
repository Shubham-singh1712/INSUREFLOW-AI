const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const claimService = require('../services/claim.service');
const { getClaimActivity } = require('../services/activity.service');
const { getClaimValidationLogs } = require('../services/validationLog.service');
const { processClaimDocument } = require('../services/process.service');

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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const processClaim = asyncHandler(async (req, res) => {
  let fileToProcess = req.file;

  if (!fileToProcess && req.body.documents) {
    const docs = req.body.documents;
    const key = Object.keys(docs)[0];
    const doc = docs[key];

    if (doc && doc.dataUrl) {
      const match = doc.dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
      if (match && match[2]) {
        const buffer = Buffer.from(match[3], 'base64');
        const tmpPath = path.join(__dirname, '..', 'uploads', `${Date.now()}-${crypto.randomUUID()}.pdf`);
        fs.writeFileSync(tmpPath, buffer);
        
        fileToProcess = {
          path: tmpPath,
          originalname: doc.name || 'document.pdf',
          mimetype: match[1] || 'application/pdf',
          size: buffer.length,
        };
      }
    }
  }

  if (!fileToProcess) {
    throw new ApiError(400, 'No document found to process.');
  }

  const result = await processClaimDocument({
    file: fileToProcess,
    user: req.user,
  });

  return sendSuccess(res, 200, 'Claim processed successfully.', { ...result, data: result });
});

module.exports = { createClaim, getAllClaims, getClaim, updateStatus, deleteClaim, processClaim };
