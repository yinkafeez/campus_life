import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

/*
 * Running serial numbers for matric allocation, one document per sequence:
 *   key = "v<formatVersion>:<entry year>:<scope>:<scope id>"
 * Serials are taken with an atomic $inc (findOneAndUpdate + upsert), so concurrent
 * matriculations can never receive the same serial.
 */
const matricSequenceSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, trim: true, maxlength: 200 },
    value: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

matricSequenceSchema.index({ university: 1, key: 1 }, { unique: true });

const MatricSequence = mongoose.model('MatricSequence', matricSequenceSchema);

export default MatricSequence;
