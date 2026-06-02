const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  return sendSuccess(res, 201, 'Account created successfully.', result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  return sendSuccess(res, 200, 'Logged in successfully.', result);
});

const logout = asyncHandler(async (_req, res) => {
  return sendSuccess(res, 200, 'Logged out successfully.', { tokenInvalidatedClientSide: true });
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'Current user loaded.', { user: req.user.toSafeObject() });
});

module.exports = { register, login, logout, me };
