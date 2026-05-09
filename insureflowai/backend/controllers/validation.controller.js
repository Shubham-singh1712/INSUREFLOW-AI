const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { validateClaim } = require('../services/aiValidation.service');

const validate = asyncHandler(async (req, res) => {
  const result = await validateClaim({
    claimId: req.body.claimId,
    user: req.user,
  });

  return sendSuccess(res, 200, 'Claim validation completed.', result);
});

module.exports = { validate };
