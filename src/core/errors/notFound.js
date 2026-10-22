import AppError from './AppError.js';

// handling unhandled routes
const notFound = (req, res, next) => {
  next(
    new AppError(
      `Can't find ${req.method} ${req.originalUrl} on this server!`,
      404,
      'ROUTE_NOT_FOUND',
    ),
  );
};

export default notFound;
