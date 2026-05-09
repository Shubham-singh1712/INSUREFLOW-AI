const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      hospitalName: user.hospitalName,
    },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const registerUser = async (payload) => {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account already exists for this email.');

  const user = await User.create(payload);
  const token = signToken(user);
  return { user: user.toSafeObject(), token };
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  return { user: user.toSafeObject(), token };
};

module.exports = { registerUser, loginUser, signToken };
