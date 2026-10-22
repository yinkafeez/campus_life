import AppError from './AppError.js';

// ─── Known library errors → operational AppErrors ─────────────────────────

// invalid ObjectId, e.g. /api/v1/universities/abc
const fromCastError = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');

// unique index violation, e.g. a slug that already exists
const fromDuplicateKey = (err) => {
  const fields = Object.keys(err.keyValue || err.keyPattern || {});
  return new AppError(
    `A record with that ${fields.join(', ') || 'value'} already exists.`,
    409,
    'DUPLICATE_KEY',
    fields.map((field) => ({ path: field, message: 'Already taken' })),
  );
};

// mongoose schema validation
const fromMongooseValidation = (err) =>
  AppError.validation(
    Object.values(err.errors || {}).map((el) => ({
      path: el.path,
      message: el.message,
    })),
  );

// body-parser errors
const fromBodyParser = (err) => {
  if (err.type === 'entity.parse.failed')
    return new AppError('Malformed JSON in request body.', 400, 'INVALID_JSON');
  if (err.type === 'entity.too.large')
    return new AppError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
  return null;
};

// turn known errors into AppErrors (null when unknown → treated as a bug)
export function normaliseError(err) {
  if (err instanceof AppError) return err;
  if (err?.name === 'CastError') return fromCastError(err);
  if (err?.code === 11000) return fromDuplicateKey(err);
  if (err?.name === 'ValidationError') return fromMongooseValidation(err);
  if (err?.type) return fromBodyParser(err);
  return null;
}

// GLOBAL ERROR HANDLER — every error response has the same shape:
// { status: 'fail' | 'error', error: { code, message, details? }, requestId }
export function createErrorHandler({ isProduction }) {
  return (err, req, res, next) => {
    const known = normaliseError(err);
    const appError =
      known ??
      new AppError(
        isProduction ? 'Something went very wrong!' : err?.message || 'Unknown error',
        500,
        'INTERNAL_ERROR',
      );

    // unknown errors are bugs: log the full error; operational ones are expected
    if (!known) req.log?.error({ err }, 'Unhandled error 💥');
    else if (appError.statusCode >= 500) req.log?.warn({ err }, appError.message);

    const body = {
      status: appError.status,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details && { details: appError.details }),
      },
      requestId: req.id,
    };

    // stack traces of unexpected errors (bugs) help in development only — never leak internals
    // in production; expected operational errors (404, 503 NOT_READY...) don't need one
    if (!isProduction && !known && err?.stack) body.error.stack = err.stack;

    res.status(appError.statusCode).json(body);
  };
}
