const mongoose = require('mongoose');

const validationLogSchema = new mongoose.Schema(
  {
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Claim',
      required: true,
      index: true,
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['upload', 'ocr', 'ai_validation', 'signature', 'blur', 'compliance', 'claim_update', 'pdf_generation'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'passed', 'warning', 'failed', 'info'],
      default: 'info',
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

validationLogSchema.index({ claim: 1, createdAt: -1 });

module.exports = mongoose.model('ValidationLog', validationLogSchema);
