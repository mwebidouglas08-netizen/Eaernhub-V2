'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { dbGet, dbAll, dbRun } = require('../db');
const { requireAdmin } = require('../middlewares/auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await dbGet('SELECT * FROM admins WHERE username=?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password))
      return res.json({ success: false, message: 'Invalid admin credentials.' });
    req.session.adminId       = admin.id;
    req.session.adminUsername = admin.username;
    return res.json({ success: true });
  } catch (e) {
    console.error('Admin login error:', e.message);
    return res.json({ success: false, message: 'Login error. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', requireAdmin, (req, res) => {
  return res.json({ success: true, username: req.session.adminUsername });
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers   = (await dbGet('SELECT COUNT(*) AS c FROM users')).c;
    const activeUsers  = (await dbGet('SELECT COUNT(*) AS c FROM users WHERE is_activated=1')).c;
    const bannedUsers  = (await dbGet('SELECT COUNT(*) AS c FROM users WHERE is_banned=1')).c;
    const pendingWd    = (await dbGet("SELECT COUNT(*) AS c FROM withdrawals WHERE status='pending'")).c;
    const totalWdPaid  = (await dbGet("SELECT COALESCE(SUM(amount),0) AS s FROM withdrawals WHERE status='approved'")).s;
    const totalRevenue = (await dbGet("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='completed'")).s;
    const recentUsers  = await dbAll(
      'SELECT id,username,email,country,mobile,is_activated,is_banned,balance,created_at FROM users ORDER BY created_at DESC LIMIT 10'
    );
    const settingsRows = await dbAll('SELECT key,value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    return res.json({
      success: true,
      stats: { totalUsers, activeUsers, bannedUsers, pendingWd, totalWdPaid, totalRevenue },
      recentUsers, settings
    });
  } catch (e) {
    console.error('Stats error:', e.message);
    return res.json({ success: false, message: 'Error loading stats.' });
  }
});

router.get('/users', requireAdmin, async (req, res) => {
  const search = (req.query.search || '').trim();
  const rows = await dbAll(
    `SELECT id,username,email,country,mobile,is_activated,is_banned,
     balance,total_earnings,affiliate_earnings,total_withdrawn,created_at
     FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC`,
    [`%${search}%`, `%${search}%`]
  );
  return res.json({ success: true, users: rows });
});

router.get('/users/:id', requireAdmin, async (req, res) => {
  const user = await dbGet('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!user) return res.json({ success: false, message: 'User not found.' });
  return res.json({ success: true, user });
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  const {
    is_activated, is_banned, balance, total_earnings,
    ads_earnings, tiktok_earnings, youtube_earnings,
    trivia_earnings, articles_earnings, affiliate_earnings, agent_bonus
  } = req.body;
  await dbRun(
    `UPDATE users SET
     is_activated=?, is_banned=?, balance=?, total_earnings=?,
     ads_earnings=?, tiktok_earnings=?, youtube_earnings=?,
     trivia_earnings=?, articles_earnings=?, affiliate_earnings=?,
     agent_bonus=? WHERE id=?`,
    [
      is_activated ? 1 : 0, is_banned ? 1 : 0,
      balance, total_earnings, ads_earnings, tiktok_earnings,
      youtube_earnings, trivia_earnings, articles_earnings,
      affiliate_earnings, agent_bonus, req.params.id
    ]
  );
  return res.json({ success: true, message: 'User updated successfully.' });
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  await dbRun('DELETE FROM users WHERE id=?', [req.params.id]);
  return res.json({ success: true, message: 'User deleted.' });
});

router.post('/notify', requireAdmin, async (req, res) => {
  const { user_id, title, message, type, is_global } = req.body;
  if (!title || !message)
    return res.json({ success: false, message: 'Title and message required.' });
  if (is_global) {
    await dbRun(
      'INSERT INTO notifications (title,message,type,is_global) VALUES (?,?,?,1)',
      [title, message, type || 'info']
    );
  } else {
    if (!user_id)
      return res.json({ success: false, message: 'User ID required.' });
    await dbRun(
      'INSERT INTO notifications (user_id,title,message,type,is_global) VALUES (?,?,?,?,0)',
      [user_id, title, message, type || 'info']
    );
  }
  return res.json({ success: true, message: 'Notification sent!' });
});

router.put('/settings', requireAdmin, async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await dbRun(
      'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
      [k, String(v)]
    );
  }
  return res.json({ success: true, message: 'Settings saved successfully.' });
});

router.get('/withdrawals', requireAdmin, async (req, res) => {
  const rows = await dbAll(
    `SELECT w.*, u.username FROM withdrawals w
     JOIN users u ON w.user_id=u.id ORDER BY w.created_at DESC`
  );
  return res.json({ success: true, withdrawals: rows });
});

router.put('/withdrawals/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const w = await dbGet('SELECT * FROM withdrawals WHERE id=?', [req.params.id]);
  if (!w) return res.json({ success: false, message: 'Not found.' });
  await dbRun('UPDATE withdrawals SET status=? WHERE id=?', [status, req.params.id]);
  if (status === 'approved')
    await dbRun(
      'UPDATE users SET total_withdrawn=total_withdrawn+? WHERE id=?',
      [w.amount, w.user_id]
    );
  else if (status === 'rejected')
    await dbRun(
      'UPDATE users SET balance=balance+? WHERE id=?',
      [w.amount, w.user_id]
    );
  return res.json({ success: true, message: `Withdrawal ${status}.` });
});

router.get('/payments', requireAdmin, async (req, res) => {
  const rows = await dbAll(
    `SELECT p.*, u.username FROM payments p
     JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC`
  );
  return res.json({ success: true, payments: rows });
});

module.exports = router;
