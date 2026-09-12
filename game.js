const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const POWER_ORDER = ['Speed Burst', 'Guardian Shield', 'Inferno Strike'];
const TASK_POINTS = { walk: 10, stretch: 8, extra: 5 };
const TASK_LABELS = { walk: 'Walk mission', stretch: 'Stretch mission', extra: 'Extra challenge' };
const UPGRADE_COST = 15;
const BATTLE_COST = 10;
const BATTLE_DAMAGE = 12;
const TEAM_BATTLE_DAMAGE = 25;
const ZOMBIE_REWARD = 7;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getState(userId) {
  return db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(userId);
}

function getBoss() {
  let boss = db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  const age = Date.now() - new Date(boss.week_start).getTime();
  if (age > WEEK_MS) {
    db.prepare('UPDATE world_boss SET hp = 100, week_start = ? WHERE id = 1').run(new Date().toISOString());
    boss = db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  }
  return boss;
}

function addLog(userId, message) {
  db.prepare('INSERT INTO activity_log (user_id, message) VALUES (?, ?)').run(userId, message);
}

function getLogs(userId, limit = 20) {
  return db
    .prepare('SELECT message, created_at FROM activity_log WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit);
}

function bumpStreak(state) {
  const today = todayStr();
  if (state.last_active_date === today) {
    return state.streak; // already active today, no change
  }
  const newStreak = state.last_active_date === yesterdayStr() ? state.streak + 1 : 1;
  db.prepare('UPDATE game_state SET streak = ?, last_active_date = ? WHERE user_id = ?')
    .run(newStreak, today, state.user_id);
  return newStreak;
}

function serialize(userId) {
  const state = getState(userId);
  const boss = getBoss();
  return {
    points: state.points,
    xp: state.xp,
    level: state.level,
    streak: state.streak,
    powers: JSON.parse(state.powers),
    boss: { hp: boss.hp },
    logs: getLogs(userId).map((l) => l.message),
  };
}

router.get('/state', (req, res) => {
  res.json(serialize(req.userId));
});

router.post('/task', (req, res) => {
  const { type } = req.body || {};
  if (!TASK_POINTS[type]) {
    return res.status(400).json({ error: 'type must be one of: walk, stretch, extra' });
  }

  let state = getState(req.userId);

  if (type === 'extra') {
    const today = todayStr();
    if (state.extra_challenge_date === today) {
      return res.status(409).json({ error: 'Extra challenge already completed today' });
    }
    db.prepare('UPDATE game_state SET extra_challenge_date = ? WHERE user_id = ?').run(today, req.userId);
  }

  const gained = TASK_POINTS[type];
  let { points, xp, level } = state;
  points += gained;
  xp += gained;
  if (xp >= 100) {
    level += 1;
    xp -= 100;
    addLog(req.userId, `🎉 Level up! New level: ${level}`);
  }

  db.prepare('UPDATE game_state SET points = ?, xp = ?, level = ? WHERE user_id = ?')
    .run(points, xp, level, req.userId);

  addLog(req.userId, `${TASK_LABELS[type]} completed: +${gained} points`);
  bumpStreak(getState(req.userId));

  res.json(serialize(req.userId));
});

router.post('/upgrade', (req, res) => {
  const state = getState(req.userId);
  if (state.points < UPGRADE_COST) {
    addLog(req.userId, '❌ Not enough points for an upgrade.');
    return res.status(200).json(serialize(req.userId));
  }
  const powers = JSON.parse(state.powers);
  const next = POWER_ORDER.find((p) => !powers.includes(p));
  if (!next) {
    return res.status(200).json(serialize(req.userId));
  }
  powers.push(next);
  db.prepare('UPDATE game_state SET points = points - ?, powers = ? WHERE user_id = ?')
    .run(UPGRADE_COST, JSON.stringify(powers), req.userId);
  addLog(req.userId, `🛡️ Avatar upgraded! Unlocked: ${next}`);
  res.json(serialize(req.userId));
});

router.post('/spin', (req, res) => {
  const options = ['20 squats', '5-minute walk', '10 jumping jacks', '1-minute plank', 'Stretch break'];
  const pick = options[Math.floor(Math.random() * options.length)];
  addLog(req.userId, `🎡 Wheel challenge: ${pick}`);
  res.json(serialize(req.userId));
});

router.post('/zombie-complete', (req, res) => {
  db.prepare('UPDATE game_state SET points = points + ? WHERE user_id = ?').run(ZOMBIE_REWARD, req.userId);
  addLog(req.userId, `🧟 Zombie Chase completed: +${ZOMBIE_REWARD} points`);
  res.json(serialize(req.userId));
});

router.post('/battle', (req, res) => {
  const state = getState(req.userId);
  if (state.points < BATTLE_COST) {
    addLog(req.userId, '❌ Save 10 points to attack the boss.');
    return res.status(200).json(serialize(req.userId));
  }
  db.prepare('UPDATE game_state SET points = points - ? WHERE user_id = ?').run(BATTLE_COST, req.userId);

  const boss = getBoss();
  const newHp = Math.max(0, boss.hp - BATTLE_DAMAGE);
  db.prepare('UPDATE world_boss SET hp = ? WHERE id = 1').run(newHp);

  addLog(req.userId, `⚔️ You hit the Shadow King for ${BATTLE_DAMAGE} damage!`);
  if (newHp === 0) {
    addLog(req.userId, '👑 BOSS DEFEATED! Legendary reward unlocked!');
  }
  res.json(serialize(req.userId));
});

router.post('/team-battle', (req, res) => {
  const membership = db.prepare('SELECT squad_id FROM squad_members WHERE user_id = ?').get(req.userId);
  if (!membership) {
    return res.status(400).json({ error: 'Join a squad before starting a squad raid' });
  }
  const boss = getBoss();
  const newHp = Math.max(0, boss.hp - TEAM_BATTLE_DAMAGE);
  db.prepare('UPDATE world_boss SET hp = ? WHERE id = 1').run(newHp);

  const members = db.prepare('SELECT user_id FROM squad_members WHERE squad_id = ?').all(membership.squad_id);
  for (const m of members) {
    addLog(m.user_id, `👥 Squad Raid dealt ${TEAM_BATTLE_DAMAGE} damage!`);
  }
  if (newHp === 0) {
    for (const m of members) addLog(m.user_id, '👑 BOSS DEFEATED! Legendary reward unlocked!');
  }
  res.json(serialize(req.userId));
});

module.exports = router;
