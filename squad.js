const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function genInviteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A1B2C3"
}

function squadPayload(squadId) {
  const squad = db.prepare('SELECT id, name, invite_code, created_by FROM squads WHERE id = ?').get(squadId);
  if (!squad) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.username, g.level, g.points
       FROM squad_members sm
       JOIN users u ON u.id = sm.user_id
       JOIN game_state g ON g.user_id = u.id
       WHERE sm.squad_id = ?
       ORDER BY g.level DESC, g.points DESC`
    )
    .all(squadId);
  return { ...squad, members };
}

router.get('/mine', (req, res) => {
  const membership = db.prepare('SELECT squad_id FROM squad_members WHERE user_id = ?').get(req.userId);
  if (!membership) return res.json({ squad: null });
  res.json({ squad: squadPayload(membership.squad_id) });
});

router.post('/create', (req, res) => {
  const { name } = req.body || {};
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Squad name must be at least 2 characters' });
  }
  const existing = db.prepare('SELECT squad_id FROM squad_members WHERE user_id = ?').get(req.userId);
  if (existing) {
    return res.status(409).json({ error: 'Leave your current squad before creating a new one' });
  }

  let inviteCode;
  const tx = db.transaction(() => {
    do {
      inviteCode = genInviteCode();
    } while (db.prepare('SELECT id FROM squads WHERE invite_code = ?').get(inviteCode));

    const info = db
      .prepare('INSERT INTO squads (name, invite_code, created_by) VALUES (?, ?, ?)')
      .run(name.trim(), inviteCode, req.userId);
    db.prepare('INSERT INTO squad_members (squad_id, user_id) VALUES (?, ?)').run(info.lastInsertRowid, req.userId);
    return info.lastInsertRowid;
  });

  const squadId = tx();
  res.status(201).json({ squad: squadPayload(squadId) });
});

router.post('/join', (req, res) => {
  const { invite_code } = req.body || {};
  if (!invite_code) return res.status(400).json({ error: 'invite_code is required' });

  const existing = db.prepare('SELECT squad_id FROM squad_members WHERE user_id = ?').get(req.userId);
  if (existing) {
    return res.status(409).json({ error: 'Leave your current squad before joining another' });
  }

  const squad = db.prepare('SELECT id FROM squads WHERE invite_code = ?').get(invite_code.toUpperCase());
  if (!squad) return res.status(404).json({ error: 'No squad found with that invite code' });

  db.prepare('INSERT INTO squad_members (squad_id, user_id) VALUES (?, ?)').run(squad.id, req.userId);
  res.json({ squad: squadPayload(squad.id) });
});

router.post('/leave', (req, res) => {
  const membership = db.prepare('SELECT squad_id FROM squad_members WHERE user_id = ?').get(req.userId);
  if (!membership) return res.status(400).json({ error: 'You are not in a squad' });
  db.prepare('DELETE FROM squad_members WHERE user_id = ?').run(req.userId);

  const remaining = db.prepare('SELECT COUNT(*) as n FROM squad_members WHERE squad_id = ?').get(membership.squad_id);
  if (remaining.n === 0) {
    db.prepare('DELETE FROM squads WHERE id = ?').run(membership.squad_id);
  }
  res.json({ squad: null });
});

module.exports = router;
