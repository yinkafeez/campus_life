import mongoose from './mongoose.js';

/*
 * Every catalogue record says how much we trust it:
 *   verified   — confirmed by an official source or ≥2 reputable independent sources
 *   unverified — real-world claim from informal/community sources, or sources disagree
 *   proposed   — invented for the game (design content, not a real-world claim)
 * A verified record must cite at least one source.
 */
export const VERIFICATION_STATUSES = ['verified', 'unverified', 'proposed'];

const sourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'A source must have a title'],
      trim: true,
      maxlength: [200, 'A source title must have at most 200 characters'],
    },
    url: {
      type: String,
      required: [true, 'A source must have a URL'],
      trim: true,
      match: [/^https?:\/\/\S+$/, 'A source URL must start with http:// or https://'],
      maxlength: 500,
    },
    accessedOn: Date,
  },
  { _id: false },
);

const verificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: {
        values: VERIFICATION_STATUSES,
        message: 'Verification is either: verified, unverified or proposed',
      },
      default: 'unverified',
    },
    sources: {
      type: [sourceSchema],
      default: [],
      validate: [(val) => val.length <= 10, 'A record may cite at most 10 sources'],
    },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

verificationSchema.path('status').validate(function (val) {
  return val !== 'verified' || this.sources.length > 0;
}, 'A verified record must cite at least one source');

export const verificationField = () => ({
  type: verificationSchema,
  default: () => ({}),
});
