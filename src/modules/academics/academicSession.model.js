import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

// "2026/2027": two consecutive years
const SESSION_NAME = /^(\d{4})\/(\d{4})$/;

const academicSessionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    name: {
      type: String,
      required: [true, 'An academic session must have a name'],
      trim: true,
      validate: {
        validator: (val) => {
          const match = SESSION_NAME.exec(val);
          return Boolean(match) && Number(match[2]) === Number(match[1]) + 1;
        },
        message: 'A session name must look like 2026/2027 (two consecutive years)',
      },
    },
    startsOn: {
      type: Date,
      required: [true, 'An academic session must have a start date'],
    },
    endsOn: {
      type: Date,
      required: [true, 'An academic session must have an end date'],
      validate: {
        // only works on CREATE and SAVE (this = the document)
        validator: function (val) {
          return !this.startsOn || val > this.startsOn;
        },
        message: 'A session must end after it starts',
      },
    },
    // the session the game is currently in for this university
    isCurrent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

academicSessionSchema.index({ university: 1, name: 1 }, { unique: true });
// at most ONE current session per university
academicSessionSchema.index(
  { university: 1 },
  {
    unique: true,
    partialFilterExpression: { isCurrent: true },
    name: 'one_current_session_per_university',
  },
);

const AcademicSession = mongoose.model('AcademicSession', academicSessionSchema);

export default AcademicSession;
