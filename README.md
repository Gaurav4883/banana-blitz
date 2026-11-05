# Banana Blitz 🍌

A real-time multiplayer puzzle race built for CIS046-3 (Software for Enterprise).
Players race to solve puzzles from the [Banana API](https://marcconrad.com/uob/banana/): the first correct answer scores, faster answers score more, and the highest score after 5 puzzles wins.

**Stack:** Next.js 16 + React 19 · Express 5 + TypeScript · Socket.IO · PostgreSQL + Prisma · Nodemailer · Vitest + supertest

## Features

- **Identity:** play as a guest, or register with email and password (scrypt). Guests can upgrade without losing their games. Email verification uses a 6-digit code. Sessions are httpOnly cookies backed by the database, and logout really revokes them.
- **Multiplayer race:** invite links, a live lobby with the player list and online status, per-player guesses, a speed bonus, a results screen and Play again.
- **Difficulty:** Easy, Medium or Hard (time limit, guesses and points).
- **Leaderboard and stats:** global ranking (verified accounts only), personal stats such as accuracy and best game.
- **Resilience:** a refresh or reconnect rejoins the game, the state resyncs after a dropped connection, and errors are shown in plain words.
- **Security:** authorization on every game action (403 for non-players), rate limiting, input validation, the solution never sent to the browser.

## Running it locally

Requirements: Node 20+, pnpm 10, Docker.

```bash
docker compose up -d                       # PostgreSQL on port 5433
pnpm install
cp backend/.env.example backend/.env       # then set DATABASE_URL (and optionally SMTP_*)
cp frontend/.env.example frontend/.env.local
cd backend && npx prisma migrate deploy && cd ..
pnpm dev                                   # backend :5000, frontend :3000
```

Open http://localhost:3000. With no `SMTP_HOST` set, verification emails go to an Ethereal test inbox and the backend log prints a preview link.

## Tests

```bash
pnpm --filter backend test     # 30 tests: Banana API, auth helpers, race scoring, API security (needs the DB running)
pnpm --filter frontend lint
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): components, data model, flows, events, security
- [Technical decisions](docs/TECHNICAL-DECISIONS.md): choices and alternatives
- [Testing](docs/TESTING.md): manual and automated test record
- [Video notes](docs/VIDEO-NOTES.md): per-phase design reasoning

## Version history

Each feature was built on its own branch, merged through a reviewed pull request and tagged:

| Tag | Feature |
|---|---|
| v0.1.0 | Banana API integration, persistence, real-time multiplayer rooms |
| v0.2.0 | Player identity: guests, accounts, email verification |
| v0.3.0 | Session ownership and per-player scores |
| v0.4.0 | Leaderboard and player stats |
| v0.5.0 | Race mode and difficulty levels |
| v0.6.0 | Reconnect handling, error states, mobile layout |
| v1.0.0 | Tests, docs and cleanup |

## AI assistance

I used Claude (Anthropic) as a coding assistant during this project, as the module brief allows. In practice:

- **What AI helped with:** writing parts of the code (mainly the identity, ownership, leaderboard, race mode and reconnect features), the tests and these docs, and suggesting design options with their trade-offs.
- **What I did:** decided which features to build and the rules (for example race mode instead of co-op, verified-only leaderboard), tested each feature by hand, found and reported bugs (for example everyone getting points for someone else's answer, no way back to the dashboard), reviewed every pull request, and managed all the Git branches, merges and tags myself.
- **How it is marked:** files and sections written with AI help start with an `AI-assisted (Claude, Anthropic)` comment. Commits made with AI help carry a `Co-Authored-By: Claude` line.
- **The video:** the presentation, explanation and voice-over are my own work (no AI).
