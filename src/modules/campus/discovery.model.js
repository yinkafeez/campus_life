import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

// a campus location a player has found in the world (shows on their map + directory)
const discoverySchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    locationSlug: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
    discoveredAt: { type: Date, default: () => new Date(), immutable: true },
    lastVisitAt: { type: Date, default: () => new Date() },
    visits: { type: Number, default: 1, min: 1 },
  },
  { timestamps: false },
);

discoverySchema.index({ player: 1, university: 1, locationSlug: 1 }, { unique: true });

const Discovery = mongoose.model('Discovery', discoverySchema);

export default Discovery;
