const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const { requestLogger } = require('./middleware/logging.middleware');
const { notFound } = require('./middleware/notFound.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const { checkCapabilities } = require('./utils/capabilities');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 8787;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:4028',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(requestLogger);
app.use(apiLimiter);

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'InsureFlow AI backend is healthy',
    data: {
      service: 'insureflow-ai-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'InsureFlow AI API is running',
    data: {
      service: 'insureflow-ai-api',
      health: '/health',
      apiBase: '/api',
    },
  });
});

app.use('/api', routes);
app.use('/', routes);
app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  const capabilities = await checkCapabilities();
  console.log('System Capabilities:', capabilities);

  await connectDB();
  app.listen(PORT, () => {
    console.log(`InsureFlow AI API running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start InsureFlow AI API', error);
  process.exit(1);
});

module.exports = app;
