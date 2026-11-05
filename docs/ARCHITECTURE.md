# Banana Blitz — System Architecture

## 1. Overview

Banana Blitz is a multiplayer puzzle race in the browser. Players sign in (as a guest or with an account), create or join a game, and race to solve puzzles from the external Banana API. The first correct answer scores, and faster answers score more.

| Part | Technology | Job |
|---|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4 | UI, calls the REST API, listens to Socket.IO events |
| Backend | Node.js, Express 5, TypeScript | REST API, game rules, authentication, Socket.IO server |
| Database | PostgreSQL 17 (Docker) via Prisma 6 | users, sessions, games, puzzles, guesses |
| External API | Banana API (`marcconrad.com/uob/banana`) | puzzle image and its solution |
| Email | Nodemailer (SMTP, or an Ethereal test inbox in dev) | email verification codes |

```
 Browser (Next.js)                       Backend (Express + Socket.IO)           PostgreSQL
 ─────────────────                       ─────────────────────────────           ──────────
  fetch  ── REST /api/v1/* ───────────▶  loadUser → requireAuth → routes  ──▶   Prisma
   (cookie bb_session, credentials)            │                                  │
  socket ── WebSocket (same cookie) ──▶  io.use(auth) → rooms game:<id>          │
   ◀── game:* events (push) ──────────         │                                  │
                                               └── HTTPS ──▶ Banana API (puzzle + solution)
```

## 2. Backend structure

```
backend/src
  app.ts            Express app: CORS (credentials), JSON limit, loadUser, routes, 404 + error handler
  server.ts         HTTP server, Socket.IO, DB connect, graceful shutdown
  config/           Prisma client, DB connection check
  modules/
    auth/           guest/register/login/logout/me, email verification, scrypt, cookie middleware, mailer
    game/           sessions, join, puzzles, answers, skip, race rules (DIFFICULTY_SETTINGS)
    players/        leaderboard, player stats
    banana/         BananaApiService (fetch + validate the external API)
  socket/socket.ts  socket auth, rooms, player list, game/leaderboard events
```

The modules follow **routes → controller → service**. The services hold the rules and talk to Prisma, and the controllers turn error codes (e.g. `NOT_A_PLAYER`) into HTTP status codes.

## 3. Data model (Prisma)

| Model | Purpose |
|---|---|
| `User` | display name, optional email + scrypt hash, `isGuest`, `role`, email verification fields |
| `AuthSession` | **SHA-256 of** the session token, expiry. Logout deletes the row |
| `GameSession` | status (ACTIVE/COMPLETED), difficulty, puzzlesPerGame, total score, host |
| `SessionPlayer` | membership + personal score per game, `@@unique([gameSessionId, userId])` |
| `Puzzle` | image URL, **solution (never sent to the browser)**, per-player max guesses, expiry |
| `PuzzleAttempt` | every guess, who made it, whether it was right |

## 4. Main flows

**Sign in:** POST `/auth/guest` or `/auth/login`, then the server creates a random token and stores its hash. The token goes back in an `httpOnly`, `SameSite=Lax` cookie, and every request and the socket handshake send it automatically.

**Play:**
1. Create a game with a difficulty (`POST /game/sessions`). Friends join with the link (`POST /game/sessions/:id/join`).
2. `POST /sessions/:id/puzzles` reuses the active puzzle or fetches a new one from the Banana API. The network call happens *outside* the database transaction, followed by a re-check inside it.
3. `POST /puzzles/:id/answer` runs in a **serializable transaction** with retry. It checks membership, time and this player's guess count. The first correct answer gets base points + speed bonus, and the session is completed if that was the last puzzle.
4. The controller broadcasts `game:answer-updated`, `game:players`, `leaderboard:changed` and, at the end, `game:finished`.

**Reconnect:** the game id is in the URL (`?game=`). A refresh rejoins it. A socket reconnect rejoins the room and reloads the state from REST, because the database is the source of truth and events are only notifications.

## 5. Event-driven design

| Event (server to room) | When |
|---|---|
| `game:joined`, `game:player-joined/left`, `game:player-count` | room membership changes |
| `game:players` | player list with scores + online flag |
| `game:puzzle-updated` | a new puzzle |
| `game:answer-updated` | someone answered (who, result, new status) |
| `game:puzzle-skipped` | a puzzle was skipped |
| `game:finished` | the last puzzle ended; final standings |
| `leaderboard:changed` (to everyone) | "refetch", sent after any correct answer |

The REST API changes the state and Socket.IO announces it. This keeps one write path, which is easy to test with supertest, and the push events keep every browser in sync.

## 6. Security summary

- Passwords: scrypt with a random salt, constant-time compare. Login errors are the same for an unknown email and a wrong password, and a dummy hash runs for unknown emails.
- Sessions: server-side, hashed tokens, httpOnly + SameSite cookies, real revocation on logout.
- Authorization: `requireAuth` on all game and player routes; membership checks (403) on every game action and on socket room joins (stops IDOR).
- Input validation at the trust boundary (names, emails, passwords, answers, difficulty), 10kb JSON limit, rate limiting on credential endpoints.
- The Banana API response is validated (shape, number type, HTTPS image only). The solution never leaves the server.
- Only display names and numbers are exposed in the leaderboard and stats, never emails.

See `TECHNICAL-DECISIONS.md` for the alternatives and `VIDEO-NOTES.md` for the per-phase reasoning.
