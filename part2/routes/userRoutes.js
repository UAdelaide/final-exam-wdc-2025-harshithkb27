const express = require('express');
const router = express.Router();
const db = require('../models/db');  // Your MySQL connection pool

// POST /api/users/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query(
      'SELECT user_id, username, password_hash, role FROM Users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];

    // For simplicity, plain text password comparison (not for production)
    if (password !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Save user info in session (exclude password)
    req.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role
    };

    res.json({ message: 'Login successful', role: user.role });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/users/me - get current logged-in user info
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ user: req.session.user });
});

// POST /api/users/logout (optional)
// or handle logout via GET /logout route in app.js as you have

module.exports = router;
