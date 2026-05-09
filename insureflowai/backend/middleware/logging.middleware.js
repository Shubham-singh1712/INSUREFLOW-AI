const logger = require('../utils/logger');

const requestLogger = (req, _res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logger.info('request.received', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
  });
  next();
};

module.exports = { requestLogger };
