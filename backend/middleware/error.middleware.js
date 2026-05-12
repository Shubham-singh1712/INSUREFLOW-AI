const { sendError } = require('../utils/apiResponse');

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(error);
  }

  return sendError(res, statusCode, message, error.errors || null);
};

module.exports = { errorHandler };
