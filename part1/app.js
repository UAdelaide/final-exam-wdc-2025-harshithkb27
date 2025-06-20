const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
let db;

async function setupDatabase() {
  // Connect without DB to create it first
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '' // change if needed
  });

  await connection.query('CREATE DATABASE IF NOT EXISTS dogwalks');
  await connection.end();

  // Connect with DB selected
  db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dogwalks'
  });

  // Create tables if not exist
  await db.execute(`CREATE TABLE IF NOT EXISTS owners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS walkers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS dogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    size VARCHAR(20) NOT NULL,
    owner_id INT,
    FOREIGN KEY (owner_id) REFERENCES owners(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS walkrequests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dog_id INT,
    walker_id INT,
    requested_time DATETIME,
    location VARCHAR(100),
    duration_minutes INT,
    status VARCHAR(20),
    FOREIGN KEY (dog_id) REFERENCES dogs(id),
    FOREIGN KEY (walker_id) REFERENCES walkers(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    walker_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    FOREIGN KEY (walker_id) REFERENCES walkers(id)
  )`);

  // Seed data if empty
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM owners');
  if (count === 0) {
    await db.execute(`INSERT INTO owners (username) VALUES ('alice123'), ('carol123')`);
    await db.execute(`INSERT INTO walkers (username) VALUES ('bobwalker'), ('newwalker')`);
    await db.execute(`INSERT INTO dogs (name, size, owner_id) VALUES
      ('Max', 'medium', (SELECT id FROM owners WHERE username='alice123')),
      ('Bella', 'small', (SELECT id FROM owners WHERE username='carol123'))
    `);
    await db.execute(`INSERT INTO walkrequests (dog_id, walker_id, requested_time, location, duration_minutes, status) VALUES
      ((SELECT id FROM dogs WHERE name='Max'), (SELECT id FROM walkers WHERE username='bobwalker'), '2025-06-10 08:00:00', 'Parklands', 30, 'open'),
      ((SELECT id FROM dogs WHERE name='Bella'), (SELECT id FROM walkers WHERE username='newwalker'), '2025-06-10 09:30:00', 'Beachside Ave', 45, 'accepted')
    `);
    await db.execute(`INSERT INTO ratings (walker_id, rating) VALUES
      ((SELECT id FROM walkers WHERE username='bobwalker'), 5),
      ((SELECT id FROM walkers WHERE username='bobwalker'), 4)
    `);
  }
}

setupDatabase().then(() => {
  // Routes

  app.get('/api/dogs', async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT dogs.name AS dog_name, dogs.size, owners.username AS owner_username
        FROM dogs
        JOIN owners ON dogs.owner_id = owners.id
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Could not fetch dogs' });
    }
  });

  app.get('/api/walkrequests/open', async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT
          wr.id AS request_id,
          d.name AS dog_name,
          wr.requested_time,
          wr.duration_minutes,
          wr.location,
          o.username AS owner_username
        FROM walkrequests wr
        JOIN dogs d ON wr.dog_id = d.id
        JOIN owners o ON d.owner_id = o.id
        WHERE wr.status = 'open'
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Could not fetch open walk requests' });
    }
  });

  app.get('/api/walkers/summary', async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT
          w.username AS walker_username,
          COUNT(r.id) AS total_ratings,
          AVG(r.rating) AS average_rating,
          COUNT(CASE WHEN wr.status = 'completed' THEN 1 END) AS completed_walks
        FROM walkers w
        LEFT JOIN ratings r ON w.id = r.walker_id
        LEFT JOIN walkrequests wr ON w.id = wr.walker_id
        GROUP BY w.id, w.username
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Could not fetch walker summaries' });
    }
  });

  app.listen(8080, () => {
    console.log('Server listening on http://localhost:8080');
  });
}).catch(err => {
  console.error('Failed to setup database:', err);
});
