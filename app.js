const TOKEN_KEY = 'fitquest_token';
const $ = (id) => document.getElementById(id);
// Leave this empty when the frontend and backend are served by the same Node
// process. For GitHub Pages, set it in config.js to the deployed backend URL.
const API_BASE_URL = (window.FITQUEST_API_URL || '').replace(/\/+$/, '');
const IS_STATIC_HOST = /(^|\.)github\.io$/.test(window.location.hostname);

// ---------- API helper ----------
async function api(path, method = 'GET', body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    const locationHint = API_BASE_URL
      ? `the configured server (${API_BASE_URL})`
      : 'this website';
    const err = new Error(
      `Could not reach ${locationHint}. ` +
      'The FitQuest backend must be running before you can create an account.'
    );
    err.cause = networkError;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : {};
  if (!res.ok) {
    if (IS_STATIC_HOST && !API_BASE_URL) {
      const err = new Error(
        'This frontend is hosted on GitHub Pages, which cannot run the FitQuest backend. ' +
        'Deploy the server and set FITQUEST_API_URL in public/config.js.'
      );
      err.status = res.status;
      throw err;
    }
    const err = new Error(
      data.error || `FitQuest server returned ${res.status}. Please try again.`
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Auth screens ----------
function showLogin() {
  $('loginForm').style.display = 'block';
  $('registerForm').style.display = 'none';
}
function showRegister() {
  $('loginForm').style.display = 'none';
  $('registerForm').style.display = 'block';
}

async function handleLogin() {
  $('loginError').textContent = '';
  const identifier = $('loginIdentifier').value.trim();
  const password = $('loginPassword').value;
  if (!identifier || !password) {
    $('loginError').textContent = 'Enter your username/email and password.';
    return;
  }
  try {
    const { token } = await api('/auth/login', 'POST', { identifier, password });
    localStorage.setItem(TOKEN_KEY, token);
    await enterGame();
  } catch (e) {
    $('loginError').textContent = e.message;
  }
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

async function handleRegister() {
  $('registerError').textContent = '';
  const username = $('regUsername').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;
  if (!USERNAME_RE.test(username)) {
    $('registerError').textContent = 'Username must be 3-20 characters: letters, numbers, underscores (no spaces).';
    return;
  }
  if (password.length < 8) {
    $('registerError').textContent = 'Password must be at least 8 characters.';
    return;
  }
  try {
    const { token } = await api('/auth/register', 'POST', { username, email, password });
    localStorage.setItem(TOKEN_KEY, token);
    await enterGame();
  } catch (e) {
    $('registerError').textContent = e.message;
  }
}

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  $('gameScreen').style.display = 'none';
  $('nav').style.display = 'none';
  $('authScreen').style.display = 'block';
  showLogin();
}

// ---------- Game rendering ----------
const POWER_ICONS = { 'Speed Burst': '⚡', 'Guardian Shield': '🛡️', 'Inferno Strike': '🔥' };
const ALL_POWERS = ['Speed Burst', 'Guardian Shield', 'Inferno Strike'];

function renderState(state) {
  $('points').textContent = state.points;
  $('xp').textContent = `${state.xp}/100 XP`;
  $('xpbar').style.width = state.xp + '%';
  $('streak').textContent = state.streak;
  $('level').textContent = 'Level ' + state.level;
  $('boss').textContent = state.boss.hp;
  $('bossbar').style.width = state.boss.hp + '%';
  $('log').innerHTML = state.logs.slice(0, 8).map((m) => `<div>${escapeHtml(m)}</div>`).join('');

  $('powersList').innerHTML = ALL_POWERS.map((p) => {
    const unlocked = state.powers.includes(p);
    return `<div class="task"><span>${POWER_ICONS[p]} ${p}</span><span class="tag">${unlocked ? 'UNLOCKED' : 'LOCKED'}</span></div>`;
  }).join('');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function refreshState() {
  const state = await api('/game/state');
  renderState(state);
}

async function completeTask(type) {
  try {
    const state = await api('/game/task', 'POST', { type });
    renderState(state);
  } catch (e) {
    alert(e.message);
  }
}
async function upgrade() {
  try {
    const state = await api('/game/upgrade', 'POST');
    renderState(state);
  } catch (e) {
    alert(e.message);
  }
}
async function spin() {
  try {
    const state = await api('/game/spin', 'POST');
    renderState(state);
  } catch (e) {
    alert(e.message);
  }
}
async function battle() {
  try {
    const state = await api('/game/battle', 'POST');
    renderState(state);
  } catch (e) {
    alert(e.message);
  }
}
async function teamBattle() {
  try {
    const state = await api('/game/team-battle', 'POST');
    renderState(state);
  } catch (e) {
    alert(e.message);
  }
}
function zombie() {
  const s = $('zstatus');
  s.textContent = '🧟 CHASE!';
  s.style.background = '#3a2445';
  let t = 8;
  const iv = setInterval(async () => {
    t--;
    s.textContent = `🧟 ${t}s`;
    if (t <= 0) {
      clearInterval(iv);
      s.textContent = '🏆 Escaped!';
      const state = await api('/game/zombie-complete', 'POST');
      renderState(state);
    }
  }, 1000);
}

// ---------- Squad ----------
async function loadSquadModal() {
  const { squad } = await api('/squad/mine');
  if (!squad) {
    $('mbody').innerHTML = `
      <p class="muted">You're not in a squad yet. Create one or join with an invite code.</p>
      <div class="field"><input id="squadName" placeholder="Squad name"></div>
      <button onclick="createSquad()">Create Squad</button>
      <div class="field" style="margin-top:16px"><input id="joinCode" placeholder="Invite code"></div>
      <button class="alt" onclick="joinSquad()">Join Squad</button>
      <div class="error" id="squadError"></div>
    `;
  } else {
    const members = squad.members
      .map((m) => `<div class="lb-row"><span>${escapeHtml(m.username)}</span><span>Lvl ${m.level} • 🪙${m.points}</span></div>`)
      .join('');
    $('mbody').innerHTML = `
      <p><b>${escapeHtml(squad.name)}</b></p>
      <p class="muted">Invite code: <span class="invite">${squad.invite_code}</span></p>
      ${members}
      <button class="danger" style="margin-top:14px" onclick="leaveSquad()">Leave Squad</button>
    `;
  }
}
async function createSquad() {
  $('squadError').textContent = '';
  try {
    await api('/squad/create', 'POST', { name: $('squadName').value.trim() });
    await loadSquadModal();
  } catch (e) {
    $('squadError').textContent = e.message;
  }
}
async function joinSquad() {
  $('squadError').textContent = '';
  try {
    await api('/squad/join', 'POST', { invite_code: $('joinCode').value.trim() });
    await loadSquadModal();
  } catch (e) {
    $('squadError').textContent = e.message;
  }
}
async function leaveSquad() {
  await api('/squad/leave', 'POST');
  await loadSquadModal();
}

// ---------- Leaderboard ----------
async function loadLeaderboardModal() {
  const { leaderboard } = await api('/leaderboard/global');
  $('mbody').innerHTML = leaderboard
    .map((r, i) => `<div class="lb-row"><span>#${i + 1} ${escapeHtml(r.username)}</span><span>Lvl ${r.level} • 🪙${r.points}</span></div>`)
    .join('') || '<p class="muted">No players yet.</p>';
}

// ---------- Modals ----------
const STATIC_MODALS = {
  quest: ['🎯 Daily Quest', '<p>Choose a mission, complete it in real life, then claim your points.</p>'],
  world: ['🌍 World Map', '<p>Your activity unlocks new regions. Campus is open; Mystery Forest unlocks at 40 XP.</p>'],
};

async function openModal(type) {
  if (STATIC_MODALS[type]) {
    $('mtitle').textContent = STATIC_MODALS[type][0];
    $('mbody').innerHTML = STATIC_MODALS[type][1];
  } else if (type === 'squad') {
    $('mtitle').textContent = '👥 Squad';
    $('mbody').textContent = 'Loading...';
    await loadSquadModal();
  } else if (type === 'leaderboard') {
    $('mtitle').textContent = '🏆 Leaderboard';
    $('mbody').textContent = 'Loading...';
    await loadLeaderboardModal();
  }
  $('modal').style.display = 'flex';
}
function closeModal() {
  $('modal').style.display = 'none';
}

// ---------- Boot ----------
async function enterGame() {
  $('authScreen').style.display = 'none';
  $('gameScreen').style.display = 'block';
  $('nav').style.display = 'flex';
  await refreshState();
}

async function boot() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    $('authScreen').style.display = 'block';
    return;
  }
  try {
    await api('/auth/me');
    await enterGame();
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    $('authScreen').style.display = 'block';
  }
}
boot();

// ---------- PWA install ----------
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('installBanner').style.display = 'block';
});
$('installBanner').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  $('installBanner').style.display = 'none';
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
});
window.addEventListener('appinstalled', () => { $('installBanner').style.display = 'none'; });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
