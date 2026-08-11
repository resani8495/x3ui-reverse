require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const subscriptionRoutes = require('./routes/subscription');
const trafficService = require('./services/traffic');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts' }
});
app.use('/auth/login', loginLimiter);

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);
app.use('/sub', subscriptionRoutes);

// Login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Cron jobs - reset traffic monthly
cron.schedule('0 0 1 * *', () => {
  console.log('Running monthly traffic reset...');
  trafficService.monthlyReset();
});

// Check expired clients every hour
cron.schedule('0 * * * *', () => {
  trafficService.checkExpired();
});

// Initialize
db.initialize();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VPN Panel running on port ${PORT}`);
  console.log(`📡 Dashboard: http://localhost:${PORT}`);
});
