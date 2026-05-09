const sendSuccess = (res, statusCode = 200, message = 'Success', data = {}) =>
  res.status(statusCode).json({ success: true, message, data });

const sendError = (res, statusCode = 500, message = 'Something went wrong', errors = null) =>
  res.status(statusCode).json({ success: false, message, errors });

module.exports = { sendSuccess, sendError };
