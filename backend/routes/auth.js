'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun } = require('../db');

router.post('/register', async (req, res) => {
  const { username, email, country, mobile, password, confirm_password, referral } = req.body;
  if (!username || !email || !password || !mobile)
    return res.json({ success: false, message: 'All fields are required.' });
  if (password !== confirm_password)
    return res.json({ success: false, message: 'Passwords do not match.' });
  if (password.length < 6)
    return res.json({ success: false, message: 'Password must be at least 6 characters.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const ref_code = uuidv4().slice(0, 8).toUpperCase();
    await dbRun(
      `INSERT INTO users (username,email,country,mobile,password,referral_code,referred_by) VALUES (?,?,?,?,?,?,?)`,
      [username.trim(), email.trim().toLowerCase(), country || 'Kenya', mobile, hash, ref_code, referral || null]
    );
    if (referral) {
      const referrer = await dbGet('SELECT id FROM users WHERE referral_code = ?', [referral]);
      if (referrer) {
        const bonusRow = await dbGet("SELECT value FROM settings WHERE key='referral_bonus'");
        const bonus = parseFloat(bonusRow?.value || 50);
        await dbRun('UPDATE users SET affiliate_earnings=affiliate_earnings+?, balance=balance+? WHERE id=?', [bonus, bonus, referrer.id]);
      }
    }
    return res.json({ success: true, message: 'Account created! Please sign in.' });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE'))
      return res.json({ success: false, message: 'Username or email already taken.' });
    console.error('Register error:', e.message);
    return res.json({ success: false, message: 'Registration failed. Try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: 'Enter username and password.' });
  try {
    const user = await dbGet('SELECT * FROM users WHERE username=? OR email=?', [username.trim(), username.trim().toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.json({ success: false, message: 'Invalid credentials.' });
    if (user.is_banned)
      return res.json({ success: false, message: 'Your account has been suspended.' });
    req.session.userId = user.id;
    req.session.username = user.username;
    return res.json({ success: true, activated: !!user.is_activated });
  } catch (e) {
    console.error('Login error:', e.message);
    return res.json({ success: false, message: 'Login failed. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.post('/activate', async (req, res) => {
  if (!req.session.userId) return res.json({ success: false, message: 'Not logged in.' });
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, message: 'Phone number required.' });
  try {
    const feeRow = await dbGet("SELECT value FROM settings WHERE key='activation_fee'");
    const fee = parseFloat(feeRow?.value || 300);
    await dbRun('INSERT INTO payments (user_id,amount,phone,type,status) VALUES (?,?,?,?,?)', [req.session.userId, fee, phone, 'activation', 'completed']);
    await dbRun('UPDATE users SET is_activated=1 WHERE id=?', [req.session.userId]);
    return res.json({ success: true, message: 'Account activated successfully!' });
  } catch (e) {
    console.error('Activate error:', e.message);
    return res.json({ success: false, message: 'Activation failed. Try again.' });
  }
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json({ success: false });
  try {
    const user = await dbGet(
      `SELECT id,username,email,country,mobile,referral_code,is_activated,
       balance,total_earnings,ads_earnings,tiktok_earnings,youtube_earnings,
       trivia_earnings,articles_earnings,affiliate_earnings,agent_bonus,total_withdrawn,created_at
       FROM users WHERE id=?`, [req.session.userId]
    );
    if (!user) return res.json({ success: false });
    const notifications = await dbAll(
      `SELECT * FROM notifications WHERE (user_id=? OR is_global=1) AND is_read=0 ORDER BY created_at DESC LIMIT 15`,
      [req.session.userId]
    );
    const settingsRows = await dbAll('SELECT key,value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    return res.json({ success: true, user, notifications, settings });
  } catch (e) {
    console.error('Me error:', e.message);
    return res.json({ success: false });
  }
});

router.post('/notification/read/:id', async (req, res) => {
  if (!req.session.userId) return res.json({ success: false });
  await dbRun('UPDATE notifications SET is_read=1 WHERE id=?', [req.params.id]);
  return res.json({ success: true });
});

module.exports = router;
