import mongoose from '../../core/db/mongoose.js';
import { codeField, matricCodeField, nameField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';

const facultySchema = new mongoose.Schema(
  {
    university: universityRef(),
    name: nameField('faculty'),
    code: codeField('faculty'),
    // how much we trust this record (official source, community report, or game design)
    // code used inside matric numbers when it differs from the catalogue code (e.g. "08")
    matricCode: matricCodeField(),
    verification: verificationField(),
  },
  { timestamps: true },
);

// codes and names are unique within a university (two universities may both have "ENG")
facultySchema.index({ university: 1, code: 1 }, { unique: true });
facultySchema.index({ university: 1, name: 1 }, { unique: true });

const Faculty = mongoose.model('Faculty', facultySchema);

export default Faculty;
