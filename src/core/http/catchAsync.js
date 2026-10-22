// catch errors from async route handlers and pass them to the global error handler
// (Express 5 already forwards rejected promises — this keeps handlers explicit and
// lets plain functions that return promises work the same way)
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default catchAsync;
