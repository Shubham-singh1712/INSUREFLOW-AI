const fs = require('fs');
const Document = require('../models/Document');
const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { recordActivity } = require('./activity.service');
const { recordValidationLog } = require('./validationLog.service');
const { CLAIM_STATUS } = require('../constants/statuses');

const uploadToCloudinary = async (file) => {
  if (!isCloudinaryConfigured()) {
    return {
      storageProvider: 'local',
      url: file.path,
      localPath: file.path,
    };
  }

  const result = await cloudinary.uploader.upload(file.path, {
    resource_type: 'auto',
    folder: 'insureflow-ai/documents',
  });

  fs.unlink(file.path, () => {});

  return {
    storageProvider: 'cloudinary',
    url: result.secure_url,
    publicId: result.public_id,
  };
};

const uploadDocuments = async ({ files, claimId, documentType, user }) => {
  if (!files?.length) throw new ApiError(400, 'At least one document is required.');

  const claim = claimId ? await Claim.findOne({ _id: claimId, hospitalName: user.hospitalName }) : null;
  if (claimId && !claim) throw new ApiError(404, 'Claim not found for document upload.');

  const documents = [];

  for (const file of files) {
    const storage = await uploadToCloudinary(file);
    const document = await Document.create({
      claim: claim?._id,
      uploadedBy: user._id,
      documentType,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      ...storage,
    });

    documents.push(document);

    if (claim) {
      claim.uploadedDocuments.push(document._id);
      await recordValidationLog({
        claim: claim._id,
        document: document._id,
        actor: user._id,
        type: 'upload',
        status: 'passed',
        message: `${documentType} uploaded successfully.`,
        metadata: { originalName: file.originalname, size: file.size },
      });
    }
  }

  if (claim) {
    claim.workflowStatus = CLAIM_STATUS.UPLOADED;
    await claim.save();
    await recordActivity({
      claim: claim._id,
      actor: user._id,
      action: 'documents.uploaded',
      title: 'Documents uploaded',
      description: `${documents.length} document(s) uploaded for validation.`,
    });
  }

  return documents;
};

module.exports = { uploadDocuments };
