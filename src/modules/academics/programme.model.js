import mongoose from '../../core/db/mongoose.js';
import { codeField, matricCodeField, nameField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';

// a degree programme, e.g. "B.Sc. Computer Science" in the Department of Computer Sciences
const programmeSchema = new mongoose.Schema(
  {
    university: universityRef(),
    department: {
      type: mongoose.Schema.ObjectId,
      ref: 'Department',
      required: [true, 'A programme must belong to a department'],
    },
    name: nameField('programme', 160),
    code: codeField('programme'),
    // how much we trust this record (official source, community report, or game design)
    // code used inside matric numbers when it differs from the catalogue code (e.g. "08")
    matricCode: matricCodeField(),
    verification: verificationField(),
    // the degree awarded, as the university writes it ("B.Sc.", "LL.B.", "B.Eng.")
    award: {
      type: String,
      required: [true, 'A programme must have an award'],
      trim: true,
      maxlength: [20, 'An award must have at most 20 characters'],
    },
    durationYears: {
      type: Number,
      required: [true, 'A programme must have a duration'],
      min: [1, 'A programme lasts at least 1 year'],
      max: [7, 'A programme lasts at most 7 years'],
      validate: {
        validator: Number.isInteger,
        message: 'A programme duration must be a whole number of years',
      },
    },
  },
  { timestamps: true },
);

programmeSchema.index({ university: 1, code: 1 }, { unique: true });
programmeSchema.index({ department: 1 });

// the department must be in the same university
programmeSchema.plugin(sameUniversity, { path: 'department', model: 'Department' });

const Programme = mongoose.model('Programme', programmeSchema);

export default Programme;
