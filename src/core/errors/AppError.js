// an expected (operational) error: bad input, not found, forbidden...
// safe to show the client; `code` is the stable machine-readable value clients branch on
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static validation(details, message = 'Invalid input data.') {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'You are not logged in.') {
    return new AppError(message, 401, 'UNAUTHENTICATED');
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found.') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message, details) {
    return new AppError(message, 409, 'CONFLICT', details);
  }

  static unavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new AppError(message, 503, code);
  }
}

export default AppError;
