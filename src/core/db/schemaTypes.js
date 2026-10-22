import mongoose from './mongoose.js';

// reusable field definitions so every university-scoped model looks the same

// every tenant-scoped document points at its university (indexes start with this field)
export const universityRef = () => ({
  type: mongoose.Schema.ObjectId,
  ref: 'University',
  required: [true, 'A record must belong to a university'],
  immutable: true, // a record never moves to another university
});

// short machine codes: "ENG", "CSC", "04"
export const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

export const codeField = (label) => ({
  type: String,
  required: [true, `A ${label} must have a code`],
  trim: true,
  uppercase: true,
  match: [CODE_PATTERN, `A ${label} code must be 2–10 letters or digits`],
});

// a faculty/department/programme code as used inside matric numbers ("08"); optional
export const MATRIC_CODE_PATTERN = /^[A-Z0-9]{1,10}$/;

export const matricCodeField = () => ({
  type: String,
  trim: true,
  uppercase: true,
  match: [MATRIC_CODE_PATTERN, 'A matric code must be 1–10 letters or digits'],
});

// URL-safe keys for catalogue records: "salado-cafeteria", "king-jaja-hall"
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugField = (label) => ({
  type: String,
  required: [true, `A ${label} must have a slug`],
  trim: true,
  lowercase: true,
  maxlength: [80, `A ${label} slug must have at most 80 characters`],
  match: [SLUG_PATTERN, `A ${label} slug may only contain a-z, 0-9 and single dashes`],
});

// other names people use ("2k1", "SUB") — searchable, shown in the game
export const aliasesField = () => ({
  type: [{ type: String, trim: true, maxlength: 80 }],
  default: [],
  validate: [(val) => val.length <= 10, 'At most 10 aliases'],
});

export const nameField = (label, max = 120) => ({
  type: String,
  required: [true, `A ${label} must have a name`],
  trim: true,
  minlength: [2, `A ${label} name must have at least 2 characters`],
  maxlength: [max, `A ${label} name must have at most ${max} characters`],
});
