const fs = require('fs');
const Document = require('../models/Document');
const ApiError = require('../utils/ApiError');
const { recordValidationLog } = require('./validationLog.service');

const detectSignature = async ({ documentId, claimId, user }) => {
  const document = await Document.findById(documentId);
  if (!document) throw new ApiError(404, 'Document not found.');

  const text = `${document.ocrText || ''} ${document.originalName || ''}`.toLowerCase();
  const signatureDetected = /signature|signed|doctor|authorized|stamp/.test(text);
  const result = {
    signatureDetected,
    confidenceScore: signatureDetected ? 0.78 : 0.41,
    estimatedArea: signatureDetected
      ? { page: 1, x: 0.58, y: 0.72, width: 0.28, height: 0.12 }
      : null,
    message: signatureDetected ? 'Signature-like content likely exists.' : 'No signature-like content detected.',
  };

  document.quality = { ...document.quality, signatureDetected };
  await document.save();

  if (claimId) {
    await recordValidationLog({
      claim: claimId,
      document: document._id,
      actor: user._id,
      type: 'signature',
      status: signatureDetected ? 'passed' : 'warning',
      message: result.message,
      metadata: result,
    });
  }

  return result;
};

const detectBlur = async ({ documentId, claimId, user }) => {
  const document = await Document.findById(documentId);
  if (!document) throw new ApiError(404, 'Document not found.');

  const fileSize = document.localPath && fs.existsSync(document.localPath) ? fs.statSync(document.localPath).size : document.size;
  const blurScore = Math.max(12, Math.min(98, Math.round((fileSize / 1024 / 1024) * 18 + 52)));
  const readable = blurScore >= 55;
  const result = {
    blurScore,
    readable,
    qualityStatus: readable ? 'acceptable' : 'low_quality',
    message: readable ? 'Document scan quality is acceptable.' : 'Document appears too blurry or compressed.',
  };

  document.quality = { ...document.quality, blurScore, readable };
  await document.save();

  if (claimId) {
    await recordValidationLog({
      claim: claimId,
      document: document._id,
      actor: user._id,
      type: 'blur',
      status: readable ? 'passed' : 'warning',
      message: result.message,
      metadata: result,
    });
  }

  return result;
};

module.exports = { detectSignature, detectBlur };
