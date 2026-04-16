'use strict';
const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../db');
const { requireActivated } = require('../middleware/auth');

router.post('/withdraw', requireActivated, async (req, res) => {
  const { amount, mobile } = req.body;
  if (!amount || !mobile) return res.json({ success: false, message: 'Amount and phone required.' });
  try {
    const minRow = await dbGet("SELECT value FROM settings WHERE key='min_withdrawal'");
    const minW = parseFloat(minRow?.value || 500);
    const user = await dbGet('SELECT balance FROM users WHERE id=?', [req.session.userId]);
    const amt = parseFloat(amount);
    if (!user || user.balance < amt) return res.json({ success: false, message: 'Insufficient balance.' });
    if (amt < minW) return res.json({ success: false, message: `Minimum withdrawal is KES ${minW}.` });
    await dbRun('UPDATE users SET balance=balance-? WHERE id=?', [amt, req.session.userId]);
    await dbRun('INSERT INTO withdrawals (user_id,amount,mobile) VALUES (?,?,?)', [req.session.userId, amt, mobile]);
    return res.json({ success: true, message: 'Withdrawal request submitted! Processed within 24hrs.' });
  } catch (e) {
    console.error('Withdraw error:', e.message);
    return res.json({ success: false, message: 'Withdrawal failed. Try again.' });
  }
});

router.post('/voucher', requireActivated, async (req, res) => {
  return res.json({ success: false, message: 'Invalid or expired voucher code.' });
});

router.get('/downlines', requireActivated, async (req, res) => {
  const user = await dbGet('SELECT referral_code FROM users WHERE id=?', [req.session.userId]);
  const downlines = await dbAll('SELECT username,country,created_at FROM users WHERE referred_by=? ORDER BY created_at DESC', [user?.referral_code || '']);
  return res.json({ success: true, downlines });
});

router.post('/spin', requireActivated, async (req, res) => {
  const prizes = [0, 0, 0, 5, 0, 10, 0, 20, 0, 5];
  const prize = prizes[Math.floor(Math.random() * prizes.length)];
  if (prize > 0) {
    await dbRun('UPDATE users SET balance=balance+?,total_earnings=total_earnings+? WHERE id=?', [prize, prize, req.session.userId]);
  }
  return res.json({ success: true, prize, message: prize > 0 ? `🎉 You won KES ${prize}!` : 'Better luck next time!' });
});

module.exports = router;
