const mongoose = require('mongoose');

const systemStatusSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    lastRunAt: { type: Date },
    lastRunFinishedAt: { type: Date },
    lastRunStatus: {
      type: String,
      enum: ['idle', 'running', 'success', 'partial', 'failed'],
      default: 'idle',
    },
    summary: { type: String, default: '' },
    issues: { type: [String], default: [] },
    counters: {
      trending: { type: Number, default: 0 },
      categories: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemStatus', systemStatusSchema);


