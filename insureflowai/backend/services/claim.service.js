const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const generateClaimId = require('../utils/generateClaimId');
const { recordActivity } = require('./activity.service');
const { CLAIM_STATUS } = require('../constants/statuses');

const createClaim = async (payload, user) => {
  const claim = await Claim.create({
    uniqueClaimId: payload.uniqueClaimId || generateClaimId(),
    patientName: payload.patientName,
    patientId: payload.patientId,
    insuranceProvider: payload.insuranceProvider,
    diagnosis: payload.diagnosis,
    procedure: payload.procedure,
    hospitalName: payload.hospitalName || user.hospitalName,
    createdBy: user._id,
    workflowStatus: CLAIM_STATUS.DRAFT,
  });

  await recordActivity({
    claim: claim._id,
    actor: user._id,
    action: 'claim.created',
    title: 'Claim created',
    description: `Claim ${claim.uniqueClaimId} was created for ${claim.patientName}.`,
  });

  return claim;
};

const getClaims = (query, user) => {
  const filter = { hospitalName: user.hospitalName };
  if (query.status) filter.workflowStatus = query.status;
  if (query.validationStatus) filter.validationStatus = query.validationStatus;
  if (query.search) filter.$text = { $search: query.search };

  return Claim.find(filter)
    .populate('uploadedDocuments')
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 });
};

const getClaimById = async (id, user) => {
  const claim = await Claim.findOne({ _id: id, hospitalName: user.hospitalName })
    .populate('uploadedDocuments')
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');

  if (!claim) throw new ApiError(404, 'Claim not found.');
  return claim;
};

const updateClaimStatus = async (id, status, user) => {
  const claim = await getClaimById(id, user);
  claim.workflowStatus = status;
  if (status === CLAIM_STATUS.SUBMITTED) claim.submittedAt = new Date();
  await claim.save();

  await recordActivity({
    claim: claim._id,
    actor: user._id,
    action: 'claim.status_updated',
    title: 'Claim status updated',
    description: `Claim moved to ${status}.`,
    metadata: { status },
  });

  return claim;
};

const deleteClaim = async (id, user) => {
  const claim = await getClaimById(id, user);
  await claim.deleteOne();
  return claim;
};

module.exports = { createClaim, getClaims, getClaimById, updateClaimStatus, deleteClaim };
