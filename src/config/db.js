const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ DB Connection failed:', err.message);
  } else {
    console.log('PostgreSQL connected (Neon)');
    release();
  }
});

module.exports = pool;