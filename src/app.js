const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const managerRoutes = require('./routes/manager');
const checkinRoutes = require('./routes/checkins');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    message: 'AtomQuest Backend API is running',
    status: 'success',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server healthy',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;