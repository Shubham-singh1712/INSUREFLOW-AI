const express = require('express');
const claimController = require('../controllers/claim.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/role.middleware');
const { validateRequest } = require('../middleware/validate.middleware');
const { ROLES } = require('../constants/roles');
const {
  createClaimValidator,
  claimIdValidator,
  updateClaimStatusValidator,
} = require('../validators/claim.validator');

const router = express.Router();

router.use(protect);
router.post(
  '/create',
  requireRoles(ROLES.ADMIN, ROLES.HOSPITAL_ADMIN, ROLES.INSURANCE_DESK, ROLES.BILLING_EXECUTIVE),
  createClaimValidator,
  validateRequest,
  claimController.createClaim
);
router.get('/all', claimController.getAllClaims);
router.get('/:id', claimIdValidator, validateRequest, claimController.getClaim);
router.patch('/:id/status', updateClaimStatusValidator, validateRequest, claimController.updateStatus);
router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.HOSPITAL_ADMIN), claimIdValidator, validateRequest, claimController.deleteClaim);

module.exports = router;
