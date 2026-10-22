import { randomUUID } from 'node:crypto';

// accept a sane incoming id (from a proxy / the frontend) or make one,
// so a client error report can be matched to the server log line
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const genRequestId = (req, res) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
};
