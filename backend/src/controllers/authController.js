const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
require('dotenv').config();

exports.register = async (req, res) => {
  const { nickname, email, phone, password } = req.body;
  if (!nickname || !email || !password) {
    return res.status(400).json({ error: 'Nickname, email, and password required' });
  }

  try {
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (nickname, email, phone, password_hash) 
       VALUES ($1, $2, $3, $4) RETURNING id, nickname`,
      [nickname, email, phone, password_hash]
    );

    await pool.query('INSERT INTO profiles (user_id) VALUES ($1)', [result.rows[0].id]);

    res.status(201).json({ message: 'Ambassador registered', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query('SELECT id, nickname, password_hash FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, nickname: user.nickname } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
};
