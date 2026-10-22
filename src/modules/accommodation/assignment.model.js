import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';

/*
 * A player's (SIMULATED) bed space or hostel application.
 *   applied      → waiting for the hostel's ballot draw
 *   active       → has a bed (room + bed number)
 *   unsuccessful → the ballot didn't pick them (they may apply elsewhere)
 *   vacated      → moved out / withdrew
 */
export const ASSIGNMENT_STATUSES = ['applied', 'active', 'unsuccessful', 'vacated'];

const assignmentSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    hostel: { type: mongoose.Schema.ObjectId, ref: 'Hostel', required: true, immutable: true },
    session: { type: mongoose.Schema.ObjectId, ref: 'AcademicSession' },
    status: { type: String, enum: ASSIGNMENT_STATUSES, required: true },
    // true while applied or active — the index below allows ONE such record per player
    holding: { type: Boolean },
    room: { type: Number, min: 1 },
    bed: { type: Number, min: 1 },
    via: { type: String, enum: ['direct', 'ballot'], required: true, immutable: true },
    allocatedAt: Date,
    endedAt: Date,
  },
  { timestamps: true },
);

// one bed or application at a time per player
assignmentSchema.index(
  { player: 1 },
  { unique: true, partialFilterExpression: { holding: true }, name: 'one_holding_per_player' },
);
// a bed holds one player
assignmentSchema.index(
  { hostel: 1, room: 1, bed: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_player_per_bed' },
);
assignmentSchema.index({ hostel: 1, status: 1 });

assignmentSchema.plugin(sameUniversity, { path: 'hostel', model: 'Hostel' });

const AccommodationAssignment = mongoose.model('AccommodationAssignment', assignmentSchema);

export default AccommodationAssignment;
