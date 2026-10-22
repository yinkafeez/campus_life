import mongoose from 'mongoose';

// ONE configured mongoose instance for the whole app: every model imports it from here,
// so these settings are applied before any schema is compiled.

// only fields defined in the schema can be used in query filters
mongoose.set('strictQuery', true);
// wrap user-supplied filter values so `{ $gt: '' }` style operator injection can't run
// (opt out per query with .setOptions({ sanitizeFilter: false }) when building trusted filters)
mongoose.set('sanitizeFilter', true);

// shared JSON shape for every model: drop the internal version key
mongoose.plugin((schema) => {
  if (!schema.options.toJSON) {
    schema.set('toJSON', { versionKey: false });
  }
});

export default mongoose;
