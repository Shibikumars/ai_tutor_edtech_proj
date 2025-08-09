const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from current directory

// Database connection
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_DCPBKRN0Ol2v@ep-fancy-shape-a1himwjm-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: true
  }
});

// Test database connection
console.log('Attempting to connect to the database...');
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed. Please check your connection string and database status.');
    console.error('Error details:', err.message);
    console.log('Current connection string (masked):', 
      'postgresql://neondb_owner:*****@ep-fancy-shape-a1himwjm-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
    console.log('🔄 Creating tables if they do not exist...');
    
    // Create tables if they don't exist
    createTables().catch(err => {
      console.error('❌ Error creating tables:', err.message);
    });
  }
});

// Create necessary database tables
async function createTables() {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        contact VARCHAR(20),
        grade INTEGER,
        syllabus VARCHAR(50),
        password VARCHAR(100) NOT NULL,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        streak INTEGER DEFAULT 0,
        lessons_completed INTEGER DEFAULT 0,
        accuracy_rate FLOAT DEFAULT 0,
        tests_completed INTEGER DEFAULT 0,
        join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Test results table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        topic VARCHAR(100) NOT NULL,
        score INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        total INTEGER NOT NULL,
        attempted INTEGER NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Schedule items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        description TEXT,
        date DATE NOT NULL,
        time TIME,
        is_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

// API Routes

// Register new user
app.post('/api/register', async (req, res) => {
  console.log('Registration request received:', req.body);
  const { name, username, email, contact, grade, syllabus, password } = req.body;
  
  try {
    // Check if user exists
    console.log('Checking if user exists:', username);
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      console.log('Username already exists:', username);
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    
    // Insert new user
    console.log('Inserting new user:', { name, username, email, contact, grade, syllabus });
    const result = await pool.query(
      `INSERT INTO users (name, username, email, contact, grade, syllabus, password) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, username, email, contact, grade, syllabus, password] // In production, hash the password!
    );
    
    const user = result.rows[0];
    delete user.password; // Don't send password back
    console.log('User registered successfully:', { id: user.id, username: user.username });
    
    res.status(201).json({ success: true, message: 'User registered successfully', user });
  } catch (error) {
    console.error('Registration error:', error);
    // Log the complete error for debugging
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column,
      dataType: error.dataType
    });
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    // In production, compare hashed passwords
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    
    delete user.password; // Don't send password back
    
    res.json({ success: true, message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user stats
app.post('/api/update-user', async (req, res) => {
  const { username, xp, level, testsCompleted, accuracyRate, streak } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE users SET 
       xp = $1, 
       level = $2, 
       tests_completed = $3, 
       accuracy_rate = $4, 
       streak = $5 
       WHERE username = $6 RETURNING *`,
      [xp, level, testsCompleted, accuracyRate, streak, username]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = result.rows[0];
    delete user.password;
    
    res.json({ success: true, message: 'User updated successfully', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Save test results
app.post('/api/save-test-results', async (req, res) => {
  const { username, topic, score, correct, total, attempted } = req.body;
  
  try {
    // Get user ID
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Save test result
    await pool.query(
      `INSERT INTO test_results (user_id, topic, score, correct, total, attempted) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, topic, score, correct, total, attempted]
    );
    
    // Update user stats
    await pool.query(
      `UPDATE users SET 
       tests_completed = tests_completed + 1 
       WHERE id = $1`,
      [userId]
    );
    
    res.json({ success: true, message: 'Test results saved successfully' });
  } catch (error) {
    console.error('Save test results error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get test history
app.get('/api/test-history/:username', async (req, res) => {
  const { username } = req.params;
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    const testResults = await pool.query(
      `SELECT topic, score, correct, total, attempted, date 
       FROM test_results 
       WHERE user_id = $1 
       ORDER BY date DESC`,
      [userId]
    );
    
    res.json({ success: true, testHistory: testResults.rows });
  } catch (error) {
    console.error('Get test history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add note
app.post('/api/notes', async (req, res) => {
  const { username, title, content } = req.body;
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    const result = await pool.query(
      `INSERT INTO notes (user_id, title, content) 
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, content]
    );
    
    res.status(201).json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get notes
app.get('/api/notes/:username', async (req, res) => {
  const { username } = req.params;
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    const notes = await pool.query(
      `SELECT * FROM notes 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ success: true, notes: notes.rows });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add schedule item
app.post('/api/schedule', async (req, res) => {
  const { username, title, description, date, time } = req.body;
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    const result = await pool.query(
      `INSERT INTO schedule_items (user_id, title, description, date, time) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, title, description, date, time]
    );
    
    res.status(201).json({ success: true, scheduleItem: result.rows[0] });
  } catch (error) {
    console.error('Add schedule item error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get schedule items
app.get('/api/schedule/:username', async (req, res) => {
  const { username } = req.params;
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    const scheduleItems = await pool.query(
      `SELECT * FROM schedule_items 
       WHERE user_id = $1 
       ORDER BY date ASC, time ASC`,
      [userId]
    );
    
    res.json({ success: true, scheduleItems: scheduleItems.rows });
  } catch (error) {
    console.error('Get schedule items error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
