const path = require('path');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { ALLOWED_MIME_TYPES } = require('../constants/documentTypes');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(415, 'Unsupported file type. Upload PDF, JPG, PNG, or WEBP documents.'));
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE_MB || 20) * 1024 * 1024,
    files: 12,
  },
});

module.exports = { upload };
