const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const port = 3000;

// Create MySQL connection pool (adjust credentials as needed)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // add your password
  database: 'DogWalkService',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Function to insert sample data on startup for testing
async function insertSampleData() {
  try {
    // Insert users (ignore duplicates)
    await pool.query(`
      INSERT IGNORE INTO Users (username, email, password_hash, role)
      VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('newwalker', 'newwalker@example.com', 'hashed000', 'walker');
    `);

    // Insert dogs (ignore duplicates)
    await pool.query(`
      INSERT IGNORE INTO Dogs (owner_id, name, size)
      SELECT u.user_id, d.name, d.size FROM
      (SELECT 'Max' AS name, 'medium' AS size, 'alice123' AS owner) d
      JOIN Users u ON u.username = d.owner
      UNION ALL
      SELECT u.user_id, d.name, d.size FROM
      (SELECT 'Bella', 'small', 'carol123') d
      JOIN Users u ON u.username = d.owner;
    `);

    // Since MySQL doesn't support INSERT IGNORE with JOIN well, insert individually:
    const users = await pool.query("SELECT user_id, username FROM Users WHERE username IN ('alice123','carol123')");
    const userMap = {};
    users[0].forEach(u => userMap[u.username] = u.user_id);

    await pool.query(`
      INSERT IGNORE INTO Dogs (owner_id, name, size) VALUES
      (?, 'Max', 'medium'),
      (?, 'Bella', 'small')
    `, [userMap['alice123'], userMap['carol123']]);

    // Insert walk requests (ignore duplicates)
    // For testing simplicity, delete all first (optional)
    await pool.query(`DELETE FROM WalkRequests`);
    await pool.query(`
      INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
        ((SELECT dog_id FROM Dogs WHERE name='Max' AND owner_id=?), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name='Bella' AND owner_id=?), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted')
    `, [userMap['alice123'], userMap['carol123']]);

  } catch (err) {
    console.error("Error inserting sample data:", err);
  }
}

// Route: GET /api/dogs
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve dogs' });
  }
});

// Route: GET /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve open walk requests' });
  }
});

// Route: GET /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.username AS walker_username,
        COUNT(wr.rating) AS total_ratings,
        AVG(wr.rating) AS average_rating,
        COUNT(CASE WHEN wr.status = 'completed' THEN 1 END) AS completed_walks
      FROM Users u
      LEFT JOIN WalkRatings wr ON u.user_id = wr.walker_id
      LEFT JOIN WalkRequests req ON wr.request_id = req.request_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
    `);
    // Convert average_rating to float or null if no ratings
    const result = rows.map(r => ({
      walker_username: r.walker_username,
      total_ratings: Number(r.total_ratings),
      average_rating: r.average_rating !== null ? Number(parseFloat(r.average_rating).toFixed(2)) : null,
      completed_walks: Number(r.completed_walks),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve walkers summary' });
  }
});

// Start server and insert sample data
app.listen(port, async () => {
  console.log(`DogWalkService API listening on port ${port}`);
  await insertSampleData();
});
