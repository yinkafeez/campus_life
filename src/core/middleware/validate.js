import AppError from '../errors/AppError.js';

const SOURCES = ['params', 'query', 'body'];

/**
 * Validate request parts with zod schemas: validate({ params, query, body }).
 * Parsed (coerced, stripped) values land on req.validated — Express 5 makes
 * req.query read-only, so we never overwrite the originals.
 */
export default function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    SOURCES.forEach((source) => {
      if (!schemas[source]) return;
      const result = schemas[source].safeParse(req[source] ?? {});
      if (result.success) {
        validated[source] = result.data;
      } else {
        result.error.issues.forEach((issue) =>
          details.push({
            path: [source, ...issue.path].join('.'),
            message: issue.message,
          }),
        );
      }
    });

    if (details.length) return next(AppError.validation(details));

    req.validated = validated;
    next();
  };
}
