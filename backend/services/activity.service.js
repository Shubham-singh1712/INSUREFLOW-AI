const ActivityHistory = require('../models/ActivityHistory');

const recordActivity = async ({ claim, actor, action, title, description, metadata }) => {
  if (!claim) return null;

  return ActivityHistory.create({
    claim,
    actor,
    action,
    title,
    description,
    metadata,
  });
};

const getClaimActivity = (claimId) =>
  ActivityHistory.find({ claim: claimId }).sort({ createdAt: -1 }).populate('actor', 'name email role');

module.exports = { recordActivity, getClaimActivity };
