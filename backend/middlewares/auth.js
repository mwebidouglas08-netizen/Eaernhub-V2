'use strict';
const { dbGet } = require('../db');

function requireUser(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/login');
}

async function requireActivated(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  try {
    const user = await dbGet(
      'SELECT is_activated, is_banned FROM users WHERE id=?',
      [req.session.userId]
    );
    if (!user)            { req.session.destroy(); return res.redirect('/login'); }
    if (user.is_banned)   { req.session.destroy(); return res.redirect('/login'); }
    if (!user.is_activated) return res.redirect('/activate');
    return next();
  } catch (e) {
    console.error('Auth middleware error:', e.message);
    return res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect('/admin/login');
}

module.exports = { requireUser, requireActivated, requireAdmin };
