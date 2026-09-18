require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Security Headers with Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Normalize URL helper (removes trailing slashes)
const normalizeOrigin = (val) => (val ? val.trim().replace(/\/+$/, '') : '');

// Predefined production live origins
const productionOrigins = [
  'https://www.anjoaura.shop',
  'https://anjoaura.shop',
  normalizeOrigin(process.env.FRONTEND_URL),
].filter(Boolean);

// Standard local development origins
const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
];

// Additional custom origins provided via comma-separated ALLOWED_ORIGINS
const customOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => normalizeOrigin(item))
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  // Allow requests without Origin (mobile apps, server-to-server, Razorpay webhooks, curl)
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);

  // Check production and explicitly declared custom origins
  if (productionOrigins.includes(normalized) || customOrigins.includes(normalized)) {
    return true;
  }

  // Check predefined local development origins
  if (localOrigins.includes(normalized)) {
    return true;
  }

  // In non-production environments, allow any localhost/127.0.0.1 port
  if (process.env.NODE_ENV !== 'production') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
      return true;
    }
  }

  return false;
};

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      const corsError = new Error(`CORS policy blocked access from origin: ${origin}`);
      corsError.statusCode = 403;
      corsError.isOperational = true;
      return callback(corsError);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Razorpay-Signature'],
  })
);

// General Rate Limiter: 150 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

// Stricter Rate Limiter for order creation: 30 requests per 15 minutes
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order requests. Please try again later.',
  },
});

app.use('/api/', generalLimiter);
app.use('/api/payment/create-order', createOrderLimiter);

// JSON body parser with rawBody capture for Razorpay webhook verification
app.use(
  express.json({
    limit: '10kb',
    verify: (req, res, buf) => {
      // Store raw buffer for cryptographic signature validation
      req.rawBody = buf;
    },
  })
);

// URL encoded body parser
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Digital Product Payment & Delivery Backend',
  });
});

// Payment API Routes
app.use('/api/payment', paymentRoutes);

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.url} not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    const activeOrigins = Array.from(new Set([...productionOrigins, ...localOrigins, ...customOrigins]));
    console.log(`=========================================`);
    console.log(`🚀 Digital Product Backend Server Running`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🛡️  Allowed Origins: ${activeOrigins.join(', ')}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=========================================`);
  });
}

module.exports = app;
