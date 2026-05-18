const pool = require('../config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userRes = await pool.query(
      'SELECT id, COALESCE(is_suspended, FALSE) AS is_suspended FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!userRes.rows.length) {
      return res.status(401).json({ message: 'Your account has been deleted. Logging out.' });
    }

    if (userRes.rows[0].is_suspended) {
      return res.status(401).json({ message: 'Your account has been suspended. Logging out.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };