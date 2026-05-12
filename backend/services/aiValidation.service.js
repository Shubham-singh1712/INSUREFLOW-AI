const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const { runAIClaimValidation } = require('../ai/aiClient');
const { recordActivity } = require('./activity.service');
const { recordValidationLog } = require('./validationLog.service');
const { CLAIM_STATUS } = require('../constants/statuses');

const validateClaim = async ({ claimId, user }) => {
  const claim = await Claim.findOne({ _id: claimId, hospitalName: user.hospitalName }).populate('uploadedDocuments');
  if (!claim) throw new ApiError(404, 'Claim not found.');

  claim.workflowStatus = CLAIM_STATUS.AI_VALIDATING;
  await claim.save();

  const aiResult = await runAIClaimValidation({
    claim,
    documents: claim.uploadedDocuments,
  });

  claim.validationStatus = aiResult.validationStatus;
  claim.riskScore = Math.max(0, 100 - (aiResult.submissionReadiness?.score || 0));
  claim.aiSummary = aiResult.aiSummary;
  claim.repairSuggestions = aiResult.repairSuggestions || [];
  claim.submissionReadiness = aiResult.submissionReadiness || { score: 0, ready: false };
  claim.workflowStatus = claim.submissionReadiness.ready ? CLAIM_STATUS.READY_TO_SUBMIT : CLAIM_STATUS.NEEDS_REPAIR;
  await claim.save();

  await recordValidationLog({
    claim: claim._id,
    actor: user._id,
    type: 'ai_validation',
    status: aiResult.validationStatus,
    message: aiResult.aiSummary,
    metadata: aiResult,
  });

  await recordActivity({
    claim: claim._id,
    actor: user._id,
    action: 'claim.ai_validated',
    title: 'AI validation completed',
    description: aiResult.aiSummary,
  });

  return aiResult;
};

module.exports = { validateClaim };
