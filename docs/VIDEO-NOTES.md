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

| Decision                                                | Why                                                                                                             | Alternative I considered                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Server-side sessions in a DB table                      | Logout really kills the session (row deleted). Easy to revoke all sessions for a user.                          | **JWT**: stateless and no DB lookup, but you can't revoke one before it expires without a blocklist, which means adding state back. |
| httpOnly cookie                                         | JavaScript can't read it, so an XSS bug can't steal the token.                                                  | Token in `localStorage` + `Authorization` header: readable by any script on the page.                                               |
| `sameSite=lax`                                          | The browser won't send the cookie on most cross-site requests (CSRF protection).                                | `strict` breaks some normal links; a CSRF token is extra work.                                                                      |
| Hashing the token in the DB                             | If the DB leaks, the stored values can't be used as cookies.                                                    | Storing the raw token is simpler but less safe.                                                                                     |
| scrypt (built into Node)                                | Slow, salted and memory-hard; no extra package.                                                                 | bcrypt / argon2: also good, but need a native package.                                                                              |
| Same error for wrong email or wrong password            | Doesn't reveal which emails are registered (user enumeration). A dummy hash runs too, so the timing is similar. | Separate messages are friendlier but leak information.                                                                              |
| Rate limit (20 / 15 min / IP) on login, register, guest | Slows down password guessing.                                                                                   | Account lockout: can be abused to lock other people out.                                                                            |
| Guests as real `User` rows                              | The game code only ever deals with "a user"; upgrading is just an update.                                       | Guest identity only in the browser: lost when the browser storage is cleared and can't own data on the server.                      |

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
4. Sign out, then try `fetch("http://localhost:5000/api/v1/game/sessions", {method:"POST", credentials:"include"})` and show the 401.
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

| Test                               | Result                     |
| ---------------------------------- | -------------------------- |
| Eve (not joined) reads the session | 403                        |
| Eve answers a puzzle               | 403                        |
| Bob joins, then answers correctly  | Bob 100, Alice 0, team 100 |
| Join with no cookie                | 401                        |

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

| Decision                                                      | Why                                                                                   | Alternative                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Only **verified** accounts are ranked                         | Makes email verification matter; stops throwaway or guest accounts spamming the board | Rank everyone: easy to cheat with new guests                                                      |
| Totals worked out on request (`groupBy` over `SessionPlayer`) | Always correct; no second copy of the score that could drift                          | A stored `totalScore` on `User`: faster reads, but has to be updated in every scoring transaction |
| Socket sends only a "changed" ping, not the data              | One source of truth (the REST API); small messages                                    | Push the full board to everyone: wasteful when most clients aren't looking at it                  |
| Stats need sign in, no emails exposed                         | Stops scraping; privacy (only display names + numbers)                                | Public API                                                                                        |
| `limit` clamped to 1-50                                       | Nobody can ask for the whole table in one request                                     | No limit: easy way to make the DB work hard                                                       |

### Tested (script against the DB)

- A guest with 5000 points is **not** on the board; verified players are, in score order.
- A player's `rank` from the stats endpoint matches their position on the board.
- An unknown player id gives 404 `PLAYER_NOT_FOUND`.

### Limits

- `groupBy` over all rows is fine at this size, but at scale it would need a stored total or a materialised view.
- The `leaderboard:changed` ping only reaches clients with an open socket (in a game). The home screen refetches when you come back to it.

## Phase 4: Race mode and difficulty levels

### Why (critical evaluation)
After Phase 3, multiplayer had no real point. Everyone saw the same puzzle, the first correct answer took the points, and the "team score" was only everyone's points added up. Nobody won or lost anything, so it changed nothing. The guesses were also shared, so one player's wrong guesses used up everyone's tries. I changed it to a **race**, which matches how the game was actually being played.

### Rules
- A game is **5 puzzles**. When the last one ends (solved, failed, skipped or expired), the session becomes `COMPLETED` and everyone gets the results screen (`game:finished` event).
- The **first correct answer** takes the points. The highest score at the end wins (a draw is possible).
- **Speed bonus:** up to +50% for solving straight away, going down to 0 at 30 seconds (`calculatePoints`).
- **Everyone has their own guesses.** A puzzle only fails when every player has used all of theirs.
- **Difficulty** is picked when you create a game. The Banana API has no difficulty option (I checked its docs), so the levels are our own rules:

| Level | Time | Guesses | Points |
|---|---|---|---|
| Easy | 5 min | 10 | 100 |
| Medium | 3 min | 5 | 200 |
| Hard | 90 s | 3 | 400 |

### How it's built
- `GameSession.difficulty` (enum) and `puzzlesPerGame`; the index `PuzzleAttempt(puzzleId, userId)` makes counting one player's guesses quick.
- The rules live in one place: `DIFFICULTY_SETTINGS` in `game.service.ts`. The frontend only shows them; the server enforces them.
- Ending the game happens **in the same serializable transaction** that ends the last puzzle, so two players can't "finish" it twice.
- A countdown timer in the UI is only for display. The server checks the time itself on every action, so changing the browser clock doesn't help.

### Tested
- Unit tests (`tests/race.test.ts`): the bonus is 100% at 0 s, 50% at 15 s and 0 after 30 s; harder levels have less time, fewer guesses and more points.
- DB script with 2 players:

| Check | Result |
|---|---|
| Bad difficulty | `INVALID_DIFFICULTY` |
| A guesses wrong 3 times | the puzzle stays ACTIVE; "Waiting for the others" |
| A's 4th guess | `NO_ATTEMPTS_REMAINING` |
| B also uses all 3 | the puzzle becomes FAILED |
| B solves the last puzzle straight away | 600 points (400 + 200 bonus); the game becomes COMPLETED |
| Next puzzle after the end | refused |

- In the browser: picked Hard, then saw the timer, "Your guesses 0/3" and "Puzzle 1/5". A fast correct answer gave 463 points (400 + 63 bonus) and showed the results screen. "Play again" started a new Hard game.

### Alternatives I considered
- **Co-op mode** (shared lives, a team streak): a real reason to work together, but it needs new rules and a separate team leaderboard. Race mode was simpler and fit how people were already playing.
- **Speed bonus by position** (1st, 2nd, 3rd to solve): only one person can solve each puzzle, so a time-based bonus is clearer.

### Limits
- "Play again" makes a new game; the other players have to join with the new invite code.
- Any player can still skip the puzzle for everyone.

## Phase 5: Reconnect, loading/error states and mobile

### Disconnect and reconnect
- **The game is in the URL** (`?game=<id>`, kept up to date with `history.replaceState`). A refresh, a closed tab or a phone losing signal doesn't lose the game: on load the page sees `?game=` and joins again. The same link is the **invite link** ("Copy link" in the lobby). A friend who opens it picks a name and goes straight into the game.
- **Socket drops:** Socket.IO reconnects by itself, but the server forgets the rooms, so every (re)connect sends `game:join` again. After a *re*connect the page also reloads the game from REST, because any events sent while we were offline (answers, a new puzzle, game over) were missed. Events are fire-and-forget; the database is the source of truth.
- A yellow **"Connection lost. Reconnecting... your game is saved"** banner shows while the socket is down. Nothing is lost, because every score and guess is already in PostgreSQL.

### Loading and error states
- `fetch` failing with no response ("Failed to fetch") becomes "Can't reach the game server. Check your connection and try again."
- 429 from the rate limiter becomes a friendly "going a bit fast" message.
- Buttons are disabled while a request is in flight. Together with the serializable transactions on the server, this stops double submissions.

### Feedback and mobile
- A correct answer **pops**, a wrong one **shakes** (CSS keyframes in `globals.css`). They use `motion-safe:`, so people who turned on "reduce motion" in their OS don't get them (accessibility).
- During a game the header shrinks and the 4 stat cards sit in one row, so on a 375px phone the puzzle, answer box and Submit fit on the first screen with no sideways scrolling.
- The page title is now "Banana Blitz" (it was "Create Next App").

### Tested in the browser
| Check | Result |
|---|---|
| Create a game | the URL becomes `?game=<id>` |
| Reload with that URL | back in the same game, the timer still counting |
| Stop the backend | the banner shows, the lobby says "Connecting..." |
| Start the backend again | the banner goes away, the lobby is "Live", back in the room |
| 375px wide | no horizontal scroll; the puzzle and Submit fit on screen |

### Alternatives / limits
- **Session ID in `localStorage`** instead of the URL: it survives a refresh too, but can't be shared as a link, and two tabs would fight over it.
- **Socket.IO connection state recovery** (it replays missed events): it needs the server to buffer events. Reloading from REST is simpler and always correct.
- A puzzle can expire while you're offline; you see it as expired when you come back.
