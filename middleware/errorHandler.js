/**
 * Global centralized error handler middleware
 * Protects against leaking internal stack traces, database credentials, or sensitive secrets.
 */
function errorHandler(err, req, res, next) {
  // Server-side logging
  console.error(`[API Error] [${req.method} ${req.url}]:`, err.message || err);

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }

  // Handle CORS policy errors
  if (err.message && err.message.includes('CORS policy blocked access')) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  // Handle SyntaxError from malformed JSON payloads
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload provided in request',
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', ') || 'Validation error',
    });
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate record already exists',
    });
  }

  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);

  // Return clean, safe response
  return res.status(statusCode).json({
    success: false,
    message: err.isOperational ? err.message : 'An unexpected error occurred while processing your request',
  });
}

module.exports = errorHandler;
