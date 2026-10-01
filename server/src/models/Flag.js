import mongoose from 'mongoose';

const flagSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: [true, 'Session ID is required']
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam ID is required']
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Candidate ID is required']
    },
    code: {
      type: String,
      required: [true, 'Flag code is required'],
      trim: true,
      uppercase: true
    },
    severity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: '{VALUE} is not a valid flag severity'
      },
      default: 'low'
    },
    score: {
      type: Number,
      default: 0
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    raisedAt: {
      type: Date,
      default: Date.now
    },
    reviewed: {
      type: Boolean,
      default: false
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    note: {
      type: String,
      trim: true
    },
    verdict: {
      type: String,
      enum: {
        values: ['pending', 'valid', 'false_positive', 'dismissed'],
        message: '{VALUE} is not a valid verdict'
      },
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

export const Flag = mongoose.model('Flag', flagSchema);
export default Flag;
