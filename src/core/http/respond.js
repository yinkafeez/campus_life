// every success response has the same shape:
// { status: 'success', results?, data, meta? }
export function sendSuccess(res, data, { statusCode = 200, meta } = {}) {
  if (statusCode === 204) return res.status(204).end();

  const body = { status: 'success' };
  // lists also report how many items are in this page
  const list = data && typeof data === 'object' && Object.values(data).find(Array.isArray);
  if (list) body.results = list.length;
  body.data = data ?? null;
  if (meta) body.meta = meta;

  return res.status(statusCode).json(body);
}

export const sendCreated = (res, data) => sendSuccess(res, data, { statusCode: 201 });
