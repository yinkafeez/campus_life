import pino from 'pino';

// structured JSON logs in production, readable coloured logs in development
export function createLogger({ level = 'info', pretty = false } = {}) {
  return pino({
    level,
    // never write credentials or cookies to the logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordConfirm',
        '*.token',
      ],
      censor: '[redacted]',
    },
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  });
}
