const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fitquest.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_state (
  user_id INTEGER PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 25,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  extra_challenge_date TEXT,
  powers TEXT NOT NULL DEFAULT '["Speed Burst"]',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS squads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS squad_members (
  squad_id INTEGER NOT NULL,
  user_id INTEGER UNIQUE NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (squad_id, user_id),
  FOREIGN KEY(squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_boss (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hp INTEGER NOT NULL DEFAULT 100,
  week_start TEXT NOT NULL
);
`);

// Seed the single global world boss row if it doesn't exist yet
const bossExists = db.prepare('SELECT id FROM world_boss WHERE id = 1').get();
if (!bossExists) {
  db.prepare('INSERT INTO world_boss (id, hp, week_start) VALUES (1, 100, ?)')
    .run(new Date().toISOString());
}

module.exports = db;
