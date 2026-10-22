import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

// something a player did at a location ("ate at 2001 Cafeteria") — feeds social updates
const activityLogSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    locationSlug: { type: String, required: true, trim: true, maxlength: 80 },
    activityKey: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ player: 1, createdAt: -1 });
// activity history is kept for 90 days
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
