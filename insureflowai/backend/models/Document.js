const mongoose = require('mongoose');
const { ALLOWED_DOCUMENT_TYPES } = require('../constants/documentTypes');

const documentSchema = new mongoose.Schema(
  {
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Claim',
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: ALLOWED_DOCUMENT_TYPES,
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'local'],
      default: 'local',
    },
    url: {
      type: String,
      required: true,
    },
    publicId: String,
    localPath: String,
    categoryConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.85,
    },
    ocrStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    ocrText: String,
    ocrFields: mongoose.Schema.Types.Mixed,
    quality: {
      blurScore: Number,
      signatureDetected: Boolean,
      readable: Boolean,
    },
  },
  { timestamps: true }
);

documentSchema.index({ claim: 1, documentType: 1 });

module.exports = mongoose.model('Document', documentSchema);
