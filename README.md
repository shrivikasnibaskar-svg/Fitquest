# FitQuest RPG — Full Stack

A fitness gamification app with real user accounts, a SQLite database, and
genuine shared multiplayer: everyone's boss battles hit the same world boss,
and squads are real (invite codes, shared raid damage, a squad roster).

## What's inside

- **Backend**: Node.js + Express + SQLite (via `better-sqlite3`) + JWT auth
  (`bcryptjs` for password hashing). One process serves both the API and the
  static frontend, so there's nothing extra to run or manage.
- **Frontend**: Plain HTML/CSS/JS (`public/`) — login/register screen, then
  the game. Talks to the backend over `fetch`.
- **PWA**: installable to a home screen, with an offline-capable app shell
  (game *data* always requires a live connection to your server, since it's
  now server-authoritative).

## Local setup

Requires Node.js 18+ (20+ recommended).

```bash
cd fitquest-fullstack
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random string (this signs login
tokens — treat it like a password):

```bash
# generates a random 64-char secret you can paste into .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then start it:

```bash
npm start
```

Visit **http://localhost:3000** — register an account and play. The database
is a single file, `fitquest.db`, created automatically in the project folder
on first run.

## Important: GitHub Pages cannot run the backend

GitHub Pages only hosts static files. It cannot run `server.js`, SQLite, or
the `/api/*` routes. If the frontend is opened at a `github.io` address while
`config.js` is left empty, signup requests go back to GitHub Pages instead of
the FitQuest API and account creation will fail.

Use one of these setups:

1. **Recommended:** deploy this entire folder to a Node-capable host. Keep
   `public/config.js` empty because the same server hosts both the frontend and
   API.
2. **Separate frontend:** deploy this folder's backend to a Node-capable host,
   then set `window.FITQUEST_API_URL` in `public/config.js` to the backend's
   public origin, without a trailing slash. For example:

   ```js
   window.FITQUEST_API_URL = 'https://your-fitquest-backend.example.com';
   ```

   Deploy the contents of `public/` to GitHub Pages after that change. Verify
   the backend first by opening
   `https://your-fitquest-backend.example.com/api/health`; it should return
   `{"ok":true,"service":"fitquest-api"}`.

## How the multiplayer works

- **World Boss**: one shared boss (`world_boss` table) that every player's
  "Attack Boss" and every squad's "Squad Raid" damages. It resets to full HP
  automatically once 7 days have passed since it was last reset.
- **Squads**: create a squad to get a 6-character invite code; share it with
  friends so they can join. Squad Raid damage and log messages go out to
  every member. Leaving an empty squad deletes it.
- **Leaderboard**: ranks all players by level, then XP, then points.

## Deploying it yourself

Because this is a single Node process + one SQLite file, almost any host
that runs Node works. A few straightforward options:

### Option A: Docker (recommended — works the same everywhere)
```bash
docker build -t fitquest .
docker run -d -p 3000:3000 \
  -e JWT_SECRET=your_long_random_secret \
  -v fitquest_data:/app/data \
  --name fitquest fitquest
```
The `-v fitquest_data:/app/data` volume is what keeps your database across
restarts/redeploys — don't skip it.

### Option B: A VPS (DigitalOcean, Hetzner, EC2, etc.)
1. Install Node 20 on the server.
2. Copy this folder over (`scp` or `git clone`).
3. `npm install --omit=dev`, set up `.env` with a real `JWT_SECRET`.
4. Run it under a process manager so it survives reboots/crashes:
   ```bash
   npm install -g pm2
   pm2 start server.js --name fitquest
   pm2 save && pm2 startup
   ```
5. Put Nginx or Caddy in front for HTTPS (Caddy auto-issues certs and is one
   config file — easiest option if you don't already have a reverse proxy).

### Option C: Platform-as-a-service (Render, Railway, Fly.io)
All three support "deploy a Node app from a Dockerfile or repo" directly.
The one thing to watch: SQLite needs a **persistent disk/volume** mounted at
whatever path `DB_PATH` points to, or your data will disappear on redeploy —
each platform calls this something slightly different ("Persistent Disk" on
Render, "Volumes" on Railway/Fly).

## API reference

All `/api/game`, `/api/squad`, and `/api/leaderboard` routes require
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | `{username, email, password}` → `{token, user}` |
| POST | `/api/auth/login` | `{identifier, password}` → `{token, user}` |
| GET  | `/api/auth/me` | Current user info |
| GET  | `/api/game/state` | Points, XP, level, streak, powers, boss HP, recent logs |
| POST | `/api/game/task` | `{type: "walk"\|"stretch"\|"extra"}` — complete a mission |
| POST | `/api/game/upgrade` | Spend 15 points to unlock the next power |
| POST | `/api/game/spin` | Spin the challenge wheel (no cost, suggests an activity) |
| POST | `/api/game/zombie-complete` | Award Zombie Chase completion points |
| POST | `/api/game/battle` | Spend 10 points to hit the world boss |
| POST | `/api/game/team-battle` | Your squad hits the world boss (requires a squad) |
| GET  | `/api/squad/mine` | Your current squad + roster |
| POST | `/api/squad/create` | `{name}` → creates a squad, returns invite code |
| POST | `/api/squad/join` | `{invite_code}` → joins a squad |
| POST | `/api/squad/leave` | Leaves your current squad |
| GET  | `/api/leaderboard/global` | Top players by level/XP/points |
| GET  | `/api/leaderboard/squad/:id` | Members of a given squad, ranked |

## Notes / things to harden before a public launch

- Rate-limit `/api/auth/*` (e.g. `express-rate-limit`) to slow brute-force
  login attempts.
- Add email verification if you want to trust the email field.
- The Zombie Chase reward is currently granted purely on a client-side
  timer finishing — a motivated user could call the endpoint directly. Fine
  for personal/friends use; add a server-side check (e.g. a short-lived
  signed token issued when the chase starts) if it needs to be cheat-proof.
- Back up `fitquest.db` periodically (it's a single file — a simple cron
  job doing `cp fitquest.db backups/fitquest-$(date +%F).db` is enough for
  small-scale use).
