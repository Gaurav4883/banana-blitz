# Video notes (virtual identity)

Notes for explaining my design choices in the video and to my tutor.
(Parts of the code were written with AI help from Claude. These notes are my explanation of how it works.)

## Phase 1: Player identity

### What a player can do
- **Play as a guest**: enter a display name and that's it. A `User` row is created with `isGuest = true`.
- **Create an account**: email + password + display name.
- **Save progress**: a guest can add an email/password later. The **same** user row is upgraded, so their games stay linked to them.
- **Sign in / sign out**.

### How login works (request flow)
1. The browser sends `POST /api/v1/auth/login` with email + password.
2. The server finds the user by email and checks the password with scrypt.
3. The server creates a random 32-byte token and stores **sha256(token)** in the `AuthSession` table, with an expiry 7 days from now.
4. The raw token goes back in a cookie: `bb_session`, `httpOnly`, `sameSite=lax`, `secure` in production.
5. Every later request carries the cookie automatically. The `loadUser` middleware hashes it, looks it up and puts the user on `req.user`.
6. `requireAuth` blocks every `/api/v1/game/*` route with **401** if there is no user.
7. Socket.IO: the handshake is an HTTP request too, so the same cookie is checked in `io.use()`. Without a valid session, the socket is refused.

### Why these choices (and the alternatives)
| Decision | Why | Alternative I considered |
|---|---|---|
| Server-side sessions in a DB table | Logout really kills the session (row deleted). Easy to revoke all sessions for a user. | **JWT**: stateless and no DB lookup, but you can't revoke one before it expires without a blocklist, which means adding state back. |
| httpOnly cookie | JavaScript can't read it, so an XSS bug can't steal the token. | Token in `localStorage` + `Authorization` header: readable by any script on the page. |
| `sameSite=lax` | The browser won't send the cookie on most cross-site requests (CSRF protection). | `strict` breaks some normal links; a CSRF token is extra work. |
| Hashing the token in the DB | If the DB leaks, the stored values can't be used as cookies. | Storing the raw token is simpler but less safe. |
| scrypt (built into Node) | Slow, salted and memory-hard; no extra package. | bcrypt / argon2: also good, but need a native package. |
| Same error for wrong email or wrong password | Doesn't reveal which emails are registered (user enumeration). A dummy hash runs too, so the timing is similar. | Separate messages are friendlier but leak information. |
| Rate limit (20 / 15 min / IP) on login, register, guest | Slows down password guessing. | Account lockout: can be abused to lock other people out. |
| Guests as real `User` rows | The game code only ever deals with "a user"; upgrading is just an update. | Guest identity only in the browser: lost when the browser storage is cleared and can't own data on the server. |

### Email verification (added to Phase 1)
**Why:** without it, anyone can register with someone else's email. Verifying proves the person owns the inbox.

**Flow**
1. On register, the server makes a random 6-digit code with `crypto.randomInt` (not `Math.random`, which is predictable).
2. Only `sha256(code)` is stored on the user row, with an expiry 15 minutes ahead.
3. The code is emailed with **nodemailer**:
   - real SMTP if `SMTP_HOST` is set (for example Gmail with an app password);
   - otherwise, in development, an **Ethereal** test inbox, and the server log prints a preview link.
4. The player types the code into the banner, then `POST /auth/verify-email` sets `emailVerifiedAt`.
5. Limits: 5 wrong guesses per code (then 429, ask for a new one), and 60 seconds between resends so we can't be used to spam an inbox. The rate limiter is on top of that.
6. If the email fails to send, the sign up still works; the player presses "Resend code".

**Code vs link (alternative)**
| 6-digit code (chosen) | Magic link |
|---|---|
| Works even if the email is opened on a different device | One click, nicer UX |
| No token in URLs, browser history or server logs | The token sits in the URL; email scanners may "click" it |
| Small search space, so it needs attempt limits | Long random token, so guessing isn't a problem |

**Limitations:** unverified users can still play (only a banner). The plan is to require verification for the leaderboard. A 6-digit hash could be brute forced offline if the DB leaked, but it expires in 15 minutes; an HMAC with a server secret would fix that.

### Validation at the trust boundary
- Display name: 2-20 chars, letters/numbers/space/`_`/`-` (no HTML in the lobby).
- Email: lowercased, basic format check, unique in the DB (P2002 becomes **409**).
- Password: 8-128 chars (the max stops someone sending a huge string to burn CPU in scrypt).
- JSON body limit 10kb.

### Known limitations (honest bits for the evaluation)
- A socket that is already connected stays connected after logout until it disconnects (only the handshake is checked).
- The rate limiter memory store resets on restart and isn't shared between servers (Redis would fix it).
- No email verification or password reset.
- Any signed-in player can still join any session if they know the ID. Session ownership and the player list come next (Phase 2).

### Demo script for the video
1. Open the app and play as a guest called "Alice". Show the `bb_session` cookie in DevTools > Application > Cookies, with HttpOnly ticked.
2. In the console, type `document.cookie` and show that `bb_session` is not there (httpOnly).
3. In another browser, create an account for "Bob" and join Alice's session ID. Alice sees "Bob joined the game".
4. Sign out, then try `fetch("http://localhost:4000/api/v1/game/sessions", {method:"POST", credentials:"include"})` and show the 401.
5. Show the `AuthSession` table in Prisma Studio: only hashes, no raw tokens.

## Phase 2: Session ownership and per-player scores

### The bug that started this
When Bob answered correctly, Alice's browser also said "Correct answer, you scored 100 points". The socket broadcast didn't say **who** answered, so every browser assumed it was "you". Also, only one score existed (the session score), so there was no way to tell players apart.

### Scoring rule (decided)
- **Team score** = `GameSession.score`. Everyone in the session shares it and sees it go up.
- **Personal score** = `SessionPlayer.score`. Only the player who solved the puzzle gets the points.
- Both are updated **in the same serializable transaction**, so they can never disagree. Two players answering at the same moment still can't both score (the existing retry/conflict logic).
- Every `PuzzleAttempt` now stores `userId`, so we know who made each guess (useful for stats later).

### Ownership / authorization
- `SessionPlayer` table with `@@unique([gameSessionId, userId])`. The **database** stops duplicate joins, not just the app code.
- You become a player by creating a session (host) or calling `POST /sessions/:id/join`.
- Reading a session, creating puzzles, answering and skipping all check membership. A non-player gets **403** `NOT_A_PLAYER`.
- The Socket.IO `game:join` also checks membership, so non-players don't get the live events either.
- This prevents **IDOR** (insecure direct object reference): knowing an ID isn't enough, you have to be a member. The demo for this is in the test below.
- Removed the old `/api/v1/banana/*` routes. They let anyone submit answers with no login at all.

### Player list (event-driven)
- New event `game:players`: the list with scores plus `online` (does the player have a socket in the room?).
- Sent on join, leave, disconnect and after a correct answer. Players with 2 tabs count once.

### Tested (curl, 3 guests)
| Test | Result |
|---|---|
| Eve (not joined) reads the session | 403 |
| Eve answers a puzzle | 403 |
| Bob joins, then answers correctly | Bob 100, Alice 0, team 100 |
| Join with no cookie | 401 |

### Alternatives / limits
- The invite code is the session ID (a cuid, hard to guess). Better: a short separate join code that the host can rotate, or invite-only sessions.
- A host can't kick players yet.

## Phase 3: Leaderboard and player stats

### What's new
- **Global leaderboard** (`GET /api/v1/players/leaderboard?limit=10`): the top players by total points across all their games.
- **Player stats** (`GET /api/v1/players/me/stats` or `/players/:userId/stats`): rank, total points, games, puzzles solved, best game, accuracy (correct guesses / all guesses).
- **Home screen:** "Your stats" and the leaderboard.
- **In a game:** click a player in the lobby to see their stats.
- **Live:** after any correct answer the server emits `leaderboard:changed`, and clients refetch.

### Decisions
| Decision | Why | Alternative |
|---|---|---|
| Only **verified** accounts are ranked | Makes email verification matter; stops throwaway or guest accounts spamming the board | Rank everyone: easy to cheat with new guests |
| Totals worked out on request (`groupBy` over `SessionPlayer`) | Always correct; no second copy of the score that could drift | A stored `totalScore` on `User`: faster reads, but has to be updated in every scoring transaction |
| Socket sends only a "changed" ping, not the data | One source of truth (the REST API); small messages | Push the full board to everyone: wasteful when most clients aren't looking at it |
| Stats need sign in, no emails exposed | Stops scraping; privacy (only display names + numbers) | Public API |
| `limit` clamped to 1-50 | Nobody can ask for the whole table in one request | No limit: easy way to make the DB work hard |

### Tested (script against the DB)
- A guest with 5000 points is **not** on the board; verified players are, in score order.
- A player's `rank` from the stats endpoint matches their position on the board.
- An unknown player id gives 404 `PLAYER_NOT_FOUND`.

### Limits
- `groupBy` over all rows is fine at this size, but at scale it would need a stored total or a materialised view.
- The `leaderboard:changed` ping only reaches clients with an open socket (in a game). The home screen refetches when you come back to it.
