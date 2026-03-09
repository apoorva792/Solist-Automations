require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const aggregatorRoutes = require('./routes/aggregator');
const priceRoutes = require('./routes/price');
const shopifyRoutes = require('./routes/shopify');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'alister_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Auth middleware for protected routes
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

app.use('/api/auth', authRoutes);
app.use('/api/aggregator', requireAuth, aggregatorRoutes);
app.use('/api/price', requireAuth, priceRoutes);
app.use('/api/shopify', requireAuth, shopifyRoutes);

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 aLister server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Bright Data SERP Zone: ${process.env.SERP_API_ZONE}`);
  console.log(`🌐 Bright Data Unlocker Zone: ${process.env.WEB_UNLOCKER_ZONE}\n`);
});
