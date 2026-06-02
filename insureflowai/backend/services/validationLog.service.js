const ValidationLog = require('../models/ValidationLog');
const Claim = require('../models/Claim');

const recordValidationLog = async ({ claim, document, actor, type, status = 'info', message, metadata }) => {
  if (!claim || !message) return null;

  const log = await ValidationLog.create({
    claim,
    document,
    actor,
    type,
    status,
    message,
    metadata,
  });

  await Claim.findByIdAndUpdate(claim, {
    $push: {
      validationLogs: {
        type,
        status,
        message,
        metadata,
        createdAt: new Date(),
      },
    },
  });

  return log;
};

const getClaimValidationLogs = (claimId) =>
  ValidationLog.find({ claim: claimId }).sort({ createdAt: -1 }).populate('actor', 'name email role');

module.exports = { recordValidationLog, getClaimValidationLogs };
