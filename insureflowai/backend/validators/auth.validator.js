const { body } = require('express-validator');
const { STAFF_ROLES } = require('../constants/roles');

const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('role').optional().isIn(STAFF_ROLES).withMessage('Invalid role.'),
  body('hospitalName').trim().notEmpty().withMessage('Hospital name is required.'),
];

const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

module.exports = { registerValidator, loginValidator };
