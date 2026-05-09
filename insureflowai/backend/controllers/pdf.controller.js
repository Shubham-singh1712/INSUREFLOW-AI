const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { generateMasterPdf } = require('../services/pdf.service');

const masterPdf = asyncHandler(async (req, res) => {
  const result = await generateMasterPdf({
    claimId: req.body.claimId,
    user: req.user,
  });

  return sendSuccess(res, 201, 'Master PDF generated successfully.', result);
});

module.exports = { masterPdf };
