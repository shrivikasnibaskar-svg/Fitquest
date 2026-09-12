const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/global', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const rows = db
    .prepare(
      `SELECT u.username, g.level, g.xp, g.points, g.streak
       FROM game_state g
       JOIN users u ON u.id = g.user_id
       ORDER BY g.level DESC, g.xp DESC, g.points DESC
       LIMIT ?`
    )
    .all(limit);
  res.json({ leaderboard: rows });
});

router.get('/squad/:id', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username, g.level, g.xp, g.points, g.streak
       FROM squad_members sm
       JOIN users u ON u.id = sm.user_id
       JOIN game_state g ON g.user_id = u.id
       WHERE sm.squad_id = ?
       ORDER BY g.level DESC, g.xp DESC, g.points DESC`
    )
    .all(req.params.id);
  res.json({ leaderboard: rows });
});

module.exports = router;
