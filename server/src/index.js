const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const newsRoutes = require('./routes/newsRoutes');
const trendingRoutes = require('./routes/trendingRoutes');
const { scheduleAutoTrendingRefresh } = require('./services/trendingService');

dotenv.config();

const app = express();

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'SERPAPI_KEY', 'GOOGLE_API_KEY'];

const validateEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
validateEnv();

const SENSITIVE_PATHS = ['/api/auth', '/api/news/drafts', '/api/news/generate'];

const responseLogger = (req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  const shouldRedact = SENSITIVE_PATHS.some((path) => req.originalUrl.startsWith(path));

  res.json = (payload) => {
    const duration = Date.now() - start;
    let preview = '';
    try {
      preview = shouldRedact ? '"<omitted for privacy>"' : JSON.stringify(payload);
      if (!shouldRedact && preview.length > 800) {
        preview = `${preview.slice(0, 800)}…`;
      }
    } catch (error) {
      preview = `[unserializable payload: ${error.message}]`;
    }
    console.log(
      `[API] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms) => ${preview}`
    );
    return originalJson(payload);
  };

  next();
};

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api', responseLogger);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/trending', trendingRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      scheduleAutoTrendingRefresh();
    });
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });

