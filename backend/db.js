'use strict';
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'earnhub.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) console.error('DB open error:', err.message);
    else console.log('✅ Database connected:', DB_FILE);
  });
  _db.serialize(() => _initSchema(_db));
  return _db;
}

function _initSchema(db) {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    username          TEXT UNIQUE NOT NULL,
    email             TEXT UNIQUE NOT NULL,
    password          TEXT NOT NULL,
    country           TEXT DEFAULT 'Kenya',
    mobile            TEXT,
    referral_code     TEXT UNIQUE,
    referred_by       TEXT,
    is_activated      INTEGER DEFAULT 0,
    is_banned         INTEGER DEFAULT 0,
    balance           REAL DEFAULT 0,
    total_earnings    REAL DEFAULT 0,
    ads_earnings      REAL DEFAULT 0,
    tiktok_earnings   REAL DEFAULT 0,
    youtube_earnings  REAL DEFAULT 0,
    trivia_earnings   REAL DEFAULT 0,
    articles_earnings REAL DEFAULT 0,
    affiliate_earnings REAL DEFAULT 0,
    agent_bonus       REAL DEFAULT 100,
    total_withdrawn   REAL DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    title      TEXT NOT NULL,
    message    TEXT NOT NULL,
    type       TEXT DEFAULT 'info',
    is_read    INTEGER DEFAULT 0,
    is_global  INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    amount     REAL NOT NULL,
    mobile     TEXT NOT NULL,
    status     TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    amount     REAL NOT NULL,
    phone      TEXT NOT NULL,
    type       TEXT DEFAULT 'activation',
    status     TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Default settings
  const defaults = {
    activation_fee: '300', site_name: 'EarnHub',
    referral_bonus: '50',  min_withdrawal: '500',
    welcome_bonus: '0',    maintenance_mode: 'false'
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [k, v]);
  }

  // ALWAYS reset admin password on startup so credentials are guaranteed
  const ADMIN_USER = process.env.ADMIN_USERNAME || 'earnhub_admin';
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'EarnHub@2024!';
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.run(`INSERT INTO admins (username, password) VALUES (?, ?)
          ON CONFLICT(username) DO UPDATE SET password=excluded.password`,
    [ADMIN_USER, hash],
    function(err) {
      if (err) console.error('Admin seed error:', err.message);
      else console.log(`✅ Admin ready — username: "${ADMIN_USER}" password: "${ADMIN_PASS}"`);
    }
  );
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { getDb, dbGet, dbAll, dbRun };
