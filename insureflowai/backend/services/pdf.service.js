const fs = require('fs');
const path = require('path');
const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const { writeMasterPacket } = require('../pdf/masterPdf');
const { recordActivity } = require('./activity.service');
const { recordValidationLog } = require('./validationLog.service');

const generateMasterPdf = async ({ claimId, user }) => {
  const claim = await Claim.findOne({ _id: claimId, hospitalName: user.hospitalName }).populate('uploadedDocuments');
  if (!claim) throw new ApiError(404, 'Claim not found.');

  const aiResult = {
    validationStatus: claim.validationStatus,
    repairSuggestions: claim.repairSuggestions,
    submissionReadiness: claim.submissionReadiness,
    aiSummary: claim.aiSummary,
  };

  const buffer = await writeMasterPacket({ claim, documents: claim.uploadedDocuments, aiResult });
  const filename = `${claim.uniqueClaimId}-master-packet.pdf`;
  const outputPath = path.join(__dirname, '..', 'uploads', filename);
  fs.writeFileSync(outputPath, buffer);

  claim.masterPdfUrl = outputPath;
  await claim.save();

  await recordValidationLog({
    claim: claim._id,
    actor: user._id,
    type: 'pdf_generation',
    status: 'passed',
    message: 'Master PDF generated.',
    metadata: { outputPath, filename },
  });

  await recordActivity({
    claim: claim._id,
    actor: user._id,
    action: 'master_pdf.generated',
    title: 'Master PDF generated',
    description: 'Export-ready claim packet generated.',
  });

  return { filename, outputPath, size: buffer.length };
};

module.exports = { generateMasterPdf };
