const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, 'Authentication token is required.');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
  const user = await User.findById(decoded.id);

  if (!user || !user.isActive) {
    throw new ApiError(401, 'User session is no longer valid.');
  }

  req.user = user;
  next();
});

module.exports = { protect };
