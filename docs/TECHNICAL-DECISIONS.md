# Banana Blitz — Technical Decisions

## 1. Separate Frontend and Backend

**Decision:** Use Next.js for the frontend and Express for the backend.

**Reason:** This separates user-interface responsibilities from server-side game logic and external API communication.

**Trade-off:** Separate applications require additional configuration and communication across HTTP boundaries.

## 2. TypeScript

**Decision:** Use TypeScript for both applications.

**Reason:** Static typing helps identify programming mistakes and makes interfaces between components easier to understand.

**Limitation:** TypeScript types alone do not validate untrusted data received over HTTP.

## 3. Banana API Integration

**Decision:** Integrate the Banana API through the backend.

**Reason:** The backend can centralize response processing, error handling, and protection of the correct answer.

**Trade-off:** The backend becomes dependent on an external service whose availability and response format may change.

## 4. Git and GitHub

**Decision:** Use Git throughout development and GitHub for repository hosting.

**Reason:** Meaningful commits, feature branches, and pull requests provide traceability and support code review.

**Trade-off:** Branches and reviews introduce workflow overhead but can reduce integration risks.

## 5. PostgreSQL + Prisma

**Decision:** Store everything in PostgreSQL through Prisma.

**Reason:** Relational data (users, games, players, guesses), real transactions and unique constraints. Prisma gives typed queries and versioned migrations.

**Alternatives:** MongoDB (multi-row transactions are not as simple); in-memory storage (lost on restart, which is what the first version did).

## 6. Serializable Transactions for Game Actions

**Decision:** Answers, skips and puzzle creation run in serializable transactions, retried on Prisma `P2034`.

**Reason:** Two players answering at the same moment can't both score, and a game can't "finish" twice.

**Trade-off:** Retries under heavy contention. Fine at game scale.

## 7. Server-side Sessions in httpOnly Cookies

**Decision:** A random token in an httpOnly, SameSite=Lax cookie; only its SHA-256 is stored in the `AuthSession` table.

**Alternatives:** JWT (stateless, but can't be revoked before expiry without a blocklist); a token in `localStorage` (readable by any script, so XSS can steal it).

**Security:** Logout deletes the row. A database leak doesn't give out usable tokens.

## 8. REST for Changes, Socket.IO for Notifications

**Decision:** Every state change goes through the REST API; Socket.IO only broadcasts what happened.

**Reason:** One write path that is validated, authorized and testable with supertest. Clients that miss events (after a disconnect) reload from REST.

**Alternative:** Sending actions over the socket: lower latency, but a second path to secure and harder to test.

## 9. Authorization by Session Membership

**Decision:** The `SessionPlayer` table, a 403 for non-members on every game action and on socket room joins.

**Reason:** Stops insecure direct object reference (IDOR): knowing a game ID isn't enough.

## 10. Race Mode Instead of a Team Score

**Decision:** First correct answer scores, a speed bonus, per-player guesses, 5 puzzles per game.

**Reason:** The earlier shared "team score" changed nothing about how people played. See `VIDEO-NOTES.md` Phase 4.

**Alternative:** Co-op with shared lives: more to build and a separate leaderboard.

## 11. Game-side Difficulty

**Decision:** Easy, Medium and Hard set the time, guesses and points, defined once in `DIFFICULTY_SETTINGS`.

**Reason:** The Banana API has no difficulty parameter.

## 12. Verified-only Leaderboard

**Decision:** Only accounts with a verified email are ranked.

**Reason:** Stops throwaway or guest accounts from flooding the board, and gives email verification a purpose.

## 13. Skipped: Three.js

**Decision:** No 3D graphics.

**Reason:** The puzzle is an image. Time was better spent on identity, security and reliability, which the assessment focuses on. Feedback uses light CSS animations (respecting reduce-motion).
