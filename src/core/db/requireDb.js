import AppError from '../errors/AppError.js';
import { isDbConnected } from './connect.js';

// put in front of routers that need MongoDB: answer 503 quickly instead of letting
// requests hang for the driver's server-selection timeout while the DB is down
const requireDb = (req, res, next) => {
  if (isDbConnected()) return next();
  next(
    AppError.unavailable(
      'The database is temporarily unavailable. Please try again shortly.',
      'DATABASE_UNAVAILABLE',
    ),
  );
};

export default requireDb;
