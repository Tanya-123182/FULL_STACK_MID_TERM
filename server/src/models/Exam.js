import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true
    },
    options: {
      type: [String],
      required: [true, 'Question options are required'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 2;
        },
        message: 'A question must provide at least 2 options'
      }
    },
    correctAnswer: {
      type: String,
      required: [true, 'Correct answer is required'],
      trim: true
    }
  },
  { _id: true }
);

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
      type: String,
      trim: true
    },
    startAt: {
      type: Date,
      required: [true, 'Exam start time is required']
    },
    endAt: {
      type: Date,
      required: [true, 'Exam end time is required']
    },
    durationMinutes: {
      type: Number,
      default: 60,
      min: [1, 'Duration must be at least 1 minute']
    },
    sensitivity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid sensitivity level'
      },
      default: 'medium'
    },
    candidateIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    proctorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    questions: {
      type: [questionSchema],
      default: []
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'scheduled', 'active', 'completed', 'archived'],
        message: '{VALUE} is not a valid exam status'
      },
      default: 'scheduled'
    }
  },
  {
    timestamps: true
  }
);

// Method to safely return exam for candidates without exposing correctAnswer
examSchema.methods.toCandidateJSON = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  if (Array.isArray(obj.questions)) {
    obj.questions = obj.questions.map(q => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options
    }));
  }
  return obj;
};

export const Exam = mongoose.model('Exam', examSchema);
export default Exam;
