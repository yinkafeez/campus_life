import { getDbStatus, isDbConnected } from '../../core/db/connect.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';

const SERVICE = 'campus-life-api';

const snapshot = () => ({
  service: SERVICE,
  uptimeSeconds: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
  db: getDbStatus(),
});

// LIVENESS — the process is up and answering (200 even while the DB is down,
// so hosts don't restart a healthy server just because MongoDB is unreachable)
export const getHealth = (req, res) => {
  sendSuccess(res, snapshot());
};

// READINESS — ready to serve real traffic (needs the database)
export const getReadiness = (req, res, next) => {
  if (!isDbConnected()) {
    return next(AppError.unavailable('Not ready: the database is not connected.', 'NOT_READY'));
  }
  sendSuccess(res, { ...snapshot(), ready: true });
};
