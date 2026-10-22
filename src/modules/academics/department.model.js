import mongoose from '../../core/db/mongoose.js';
import { codeField, matricCodeField, nameField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';

const departmentSchema = new mongoose.Schema(
  {
    university: universityRef(),
    faculty: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      required: [true, 'A department must belong to a faculty'],
    },
    name: nameField('department'),
    code: codeField('department'),
    // how much we trust this record (official source, community report, or game design)
    // code used inside matric numbers when it differs from the catalogue code (e.g. "08")
    matricCode: matricCodeField(),
    verification: verificationField(),
  },
  { timestamps: true },
);

// department codes are unique within a university
departmentSchema.index({ university: 1, code: 1 }, { unique: true });
departmentSchema.index({ faculty: 1, name: 1 }, { unique: true });

// the faculty must be in the same university
departmentSchema.plugin(sameUniversity, { path: 'faculty', model: 'Faculty' });

const Department = mongoose.model('Department', departmentSchema);

export default Department;
