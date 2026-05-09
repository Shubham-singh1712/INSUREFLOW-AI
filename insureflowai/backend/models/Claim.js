const mongoose = require('mongoose');
const { CLAIM_STATUS, VALIDATION_STATUS } = require('../constants/statuses');

const repairSuggestionSchema = new mongoose.Schema(
  {
    title: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    recommendation: String,
    fieldPath: String,
    autoFixAvailable: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const validationLogSnapshotSchema = new mongoose.Schema(
  {
    type: String,
    status: String,
    message: String,
    metadata: mongoose.Schema.Types.Mixed,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    uniqueClaimId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    insuranceProvider: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    diagnosis: {
      type: String,
      required: true,
      trim: true,
    },
    procedure: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedDocuments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
      },
    ],
    validationStatus: {
      type: String,
      enum: Object.values(VALIDATION_STATUS),
      default: VALIDATION_STATUS.PENDING,
      index: true,
    },
    workflowStatus: {
      type: String,
      enum: Object.values(CLAIM_STATUS),
      default: CLAIM_STATUS.DRAFT,
      index: true,
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    aiSummary: {
      type: String,
      default: '',
    },
    repairSuggestions: [repairSuggestionSchema],
    validationLogs: [validationLogSnapshotSchema],
    extractedFields: mongoose.Schema.Types.Mixed,
    submissionReadiness: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      ready: {
        type: Boolean,
        default: false,
      },
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    masterPdfUrl: String,
    submittedAt: Date,
  },
  { timestamps: true }
);

claimSchema.index({ hospitalName: 1, createdAt: -1 });
claimSchema.index({ patientName: 'text', patientId: 'text', uniqueClaimId: 'text' });

module.exports = mongoose.model('Claim', claimSchema);
