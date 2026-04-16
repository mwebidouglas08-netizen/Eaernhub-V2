'use strict';
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PAGES = path.join(__dirname, 'public', 'pages');

const app = express();

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname }),
  secret: process.env.SESSION_SECRET || 'earnhub_s3cr3t_2024_xK9mPqRt',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Health check FIRST — before DB init so Railway can reach it immediately ──
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', app: 'EarnHub' }));

// ── Init DB ──
const { getDb } = require('./backend/db');
getDb();

// ── Static ──
app.use('/static', express.static(path.join(__dirname, 'public')));

// ── API routes ──
app.use('/api/auth',  require('./backend/routes/auth'));
app.use('/api/admin', require('./backend/routes/admin'));
app.use('/api/user',  require('./backend/routes/user'));

// ── Pages ──
const send = (f) => (_req, res) => res.sendFile(path.join(PAGES, f));
app.get('/',         send('index.html'));
app.get('/login',    send('login.html'));
app.get('/register', send('register.html'));

app.get('/activate', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(PAGES, 'activate.html'));
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const { dbGet } = require('./backend/db');
    const user = await dbGet('SELECT is_activated, is_banned FROM users WHERE id=?', [req.session.userId]);
    if (!user || user.is_banned) { req.session.destroy(); return res.redirect('/login'); }
    if (!user.is_activated) return res.redirect('/activate');
    res.sendFile(path.join(PAGES, 'dashboard.html'));
  } catch (e) {
    res.redirect('/login');
  }
});

app.get('/admin',           (_req, res) => res.redirect('/admin/login'));
app.get('/admin/login',     send('admin-login.html'));
app.get('/admin/dashboard', (req, res) => {
  if (!req.session.adminId) return res.redirect('/admin/login');
  res.sendFile(path.join(PAGES, 'admin-dashboard.html'));
});

// ── 404 ──
app.use((_req, res) => res.status(404).send(`<html><body style="background:#08111F;color:#E8EAF0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h1 style="color:#F5C518;font-size:5rem">404</h1><p>Page not found</p><a href="/" style="color:#F5C518">← Home</a></div></body></html>`));

// ── Error handler ──
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: 'Server error.' });
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EarnHub running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (r) => console.error('Rejection:', r));
