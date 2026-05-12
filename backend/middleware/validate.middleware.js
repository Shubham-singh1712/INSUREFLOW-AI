const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validateRequest = (req, _res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  return next(new ApiError(422, 'Request validation failed.', result.array()));
};

module.exports = { validateRequest };
