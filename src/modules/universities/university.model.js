import mongoose from '../../core/db/mongoose.js';
import { nameField } from '../../core/db/schemaTypes.js';
import { CONFIG_SCHEMA_VERSION, parseUniversityConfig } from './university.config.js';

export const UNIVERSITY_STATUSES = ['draft', 'active', 'archived'];

const isValidTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const locationSchema = new mongoose.Schema(
  {
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    country: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'NG',
      match: [/^[A-Z]{2}$/, 'A country must be a 2-letter ISO code'],
    },
  },
  { _id: false },
);

// the tenant root: every university-scoped record references one of these
const universitySchema = new mongoose.Schema(
  {
    name: nameField('university', 160),
    shortName: {
      type: String,
      required: [true, 'A university must have a short name'],
      trim: true,
      uppercase: true,
      maxlength: [20, 'A short name must have at most 20 characters'],
    },
    slug: {
      type: String,
      required: [true, 'A university must have a slug'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A slug may only contain a-z, 0-9 and single dashes'],
      maxlength: 60,
      immutable: true, // used in URLs and asset paths
    },
    status: {
      type: String,
      enum: {
        values: UNIVERSITY_STATUSES,
        message: 'Status is either: draft, active or archived',
      },
      default: 'draft',
    },
    location: { type: locationSchema, default: () => ({}) },
    timezone: {
      type: String,
      default: 'Africa/Lagos',
      validate: [isValidTimeZone, 'Please provide a valid IANA time zone'],
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'A currency must be a 3-letter ISO code'],
    },
    // university-specific rules as data — validated by zod (see university.config.js)
    config: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'A university must have a configuration'],
    },
    configSchemaVersion: { type: Number, default: CONFIG_SCHEMA_VERSION, min: 1 },
    // where this university's data came from and its caveats (for admins and auditors)
    dataNotes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true, minimize: false },
);

universitySchema.index({ status: 1 });

// CONFIG VALIDATION — reject an invalid config and store the normalised version
universitySchema.pre('validate', function () {
  if (this.config == null || !this.isModified('config')) return;

  const result = parseUniversityConfig(this.config);
  if (!result.success) {
    result.error.issues.forEach((issue) =>
      this.invalidate(['config', ...issue.path].join('.'), issue.message),
    );
    return;
  }
  this.config = result.data;
  this.configSchemaVersion = CONFIG_SCHEMA_VERSION;
});

const University = mongoose.model('University', universitySchema);

export default University;
