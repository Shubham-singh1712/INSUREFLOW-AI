const mongoose = require('mongoose');

const activityHistorySchema = new mongoose.Schema(
  {
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Claim',
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

activityHistorySchema.index({ claim: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityHistory', activityHistorySchema);
