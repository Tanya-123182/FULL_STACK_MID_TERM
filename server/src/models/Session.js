import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
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
    status: {
      type: String,
      enum: {
        values: ['active', 'completed'],
        message: '{VALUE} is not a valid session status'
      },
      default: 'active'
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now
    },
    flagCount: {
      type: Number,
      default: 0,
      min: [0, 'Flag count cannot be negative']
    },
    maxSeverity: {
      type: String,
      enum: {
        values: ['none', 'low', 'medium', 'high', 'critical'],
        message: '{VALUE} is not a valid severity level'
      },
      default: 'none'
    },
    userAgent: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

export const Session = mongoose.model('Session', sessionSchema);
export default Session;
