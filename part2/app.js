const express = require('express');
const path = require('path');
const session = require('express-session');
require('dotenv').config();
const db = require('./models/db');  // Your MySQL pool connection

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }  // set true if using HTTPS in production
}));

// Import routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Add missing /api/dogs route here
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT dog_id, owner_id, name, size FROM Dogs');
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch dogs:', error);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// New route to get logged-in owner's dogs (optional)
app.get('/api/owner/dogs', async (req, res) => {
  const ownerId = req.session.user?.id;
  if (!ownerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const [rows] = await db.query(
      'SELECT dog_id, name as dog_name FROM Dogs WHERE owner_id = ?',
      [ownerId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching owner dogs:', error);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Error logging out');
    }
    res.clearCookie('connect.sid'); // clear session cookie
    res.redirect('/'); // redirect to login page
  });
});

module.exports = app;
