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
