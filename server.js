require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET is not set. Copy .env.example to .env and set a real secret.');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const squadRoutes = require('./routes/squad');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'fitquest-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/squad', squadRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler so unexpected errors return JSON, not an HTML crash page
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FitQuest server running on http://localhost:${PORT}`);
});
