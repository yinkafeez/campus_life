import mongoose from '../../core/db/mongoose.js';
import { nameField, slugField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';

/*
 * A non-player character standing in a zone, with a dialogue tree.
 * Fictional characters only (porters, senior students, vendors) — never real people.
 * Dialogue shape (validated with zod on import, see bundle.schema.js):
 *   { start: { text, options: [{ label, next?: nodeId, action?: 'directions' | 'end' }] }, ... }
 */
const npcSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: slugField('NPC'),
    name: nameField('NPC', 60),
    role: { type: String, required: true, trim: true, maxlength: 60 },
    zone: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    x: { type: Number, required: true },
    z: { type: Number, required: true },
    rotY: { type: Number, default: 0 },
    // { appearance, equipped } — same shape as a player character's look
    look: { type: mongoose.Schema.Types.Mixed, required: true },
    dialogue: { type: mongoose.Schema.Types.Mixed, required: true },
    verification: verificationField(),
  },
  { timestamps: true, minimize: false },
);

npcSchema.index({ university: 1, key: 1 }, { unique: true });
npcSchema.index({ university: 1, zone: 1 });

const Npc = mongoose.model('Npc', npcSchema);

export default Npc;
