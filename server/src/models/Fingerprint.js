import mongoose from 'mongoose';

const fingerprintSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Fingerprint name is required'],
      trim: true
    },
    tool: {
      type: String,
      required: [true, 'Tool identifier is required'],
      trim: true
    },
    pattern: {
      type: String,
      required: [true, 'Signature pattern is required'],
      trim: true
    },
    category: {
      type: String,
      enum: {
        values: [
          'GenAI Tool',
          'Debugger',
          'Remote Access',
          'Communication',
          'IDE Extension',
          'Overlay Tool'
        ],
        message: '{VALUE} is not a valid category'
      },
      default: 'GenAI Tool'
    },
    weight: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'high'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export const Fingerprint = mongoose.model('Fingerprint', fingerprintSchema);
export default Fingerprint;
