# Banana Blitz — Testing Record

## 1. Purpose

This document records tests performed during the development of Banana Blitz. It includes expected results, actual results, defects discovered, and the resolution of relevant issues.

Tests must reflect the actual implementation and must not be marked as passed without verification.

## 2. Frontend and Backend Connectivity

### Test 1: Backend Health Endpoint

- **Objective:** Verify that the Express backend responds to HTTP requests.
- **Action:** Send a GET request to `/api/v1/health`.
- **Expected result:** HTTP 200 and a JSON response indicating that the service is healthy.
- **Actual result:** HTTP 200 and the expected JSON response.
- **Status:** Passed..

### Test 2: Frontend Connection

- **Objective:** Verify communication between Next.js and Express.
- **Action:** Open the frontend and click "Check Game Server".
- **Expected result:** The frontend displays the backend response.
- **Actual result:** The frontend displays the successful connection message.
- **Status:** Passed.

### Test 3: Backend Unavailable

- **Objective:** Verify how the frontend behaves when the backend cannot be reached.
- **Action:** Stop the backend and click "Check Game Server".
- **Expected result:** The frontend displays a connection error rather than a success message.
- **Actual result:** The frontend displays a connection error.
- **Status:** Passed — expected failure condition handled.

## 3. Automated Tests (Vitest)

Command: `pnpm --filter backend test`. The API tests need PostgreSQL running (`docker compose up -d`).

**Result (v1.0.0): 4 test files, 30 tests, all passing. `pnpm --filter backend build` passes; `pnpm --filter frontend lint` is clean.**

### 3.1 Banana API service (`tests/banana.service.test.ts`), using a mocked `fetch`

| Test | Expected | Result |
|---|---|---|
| Valid response | returns `{question, solution}` | Passed |
| Request | asks for `out=json` with `Accept: application/json` | Passed |
| HTTP 503 | throws "Banana API returned HTTP 503" | Passed |
| Invalid JSON | throws "invalid JSON" | Passed |
| Missing fields | throws "invalid structure" | Passed |
| Solution is a string | throws "invalid puzzle data" | Passed |
| `http://` image | refused (HTTPS only) | Passed |

The old tests were for an in-memory `BananaService` class that was replaced by the database version, so they failed with "BananaService is not a constructor". I rewrote them for `BananaApiService`.

### 3.2 Auth helpers (`tests/auth.test.ts`)

| Test | Result |
|---|---|
| scrypt hash verifies the right password, rejects a wrong one, never contains the plain text | Passed |
| Same password gives a different hash (random salt) | Passed |
| A malformed stored hash returns false instead of crashing | Passed |
| Cookie parser finds `bb_session` / handles a missing cookie | Passed |

### 3.3 Race scoring (`tests/race.test.ts`)

| Test | Result |
|---|---|
| Speed bonus is +50% at 0 s, +25% at 15 s, 0 after 30 s, and no extra for a negative time | Passed |
| Harder levels have less time, fewer guesses and more points | Passed |

### 3.4 API and security, end to end (`tests/api.test.ts`, supertest against the real app and DB)

| Test | Expected | Result |
|---|---|---|
| Health check | 200, database connected | Passed |
| Unknown route | JSON 404 (not HTML) | Passed |
| Broken JSON body | clean 400 | Passed |
| Game route without a cookie | 401 | Passed |
| Leaderboard / stats without a cookie | 401 | Passed |
| Display name `<script>` | 400 | Passed |
| Guest cookie | `HttpOnly`, `SameSite=Lax` | Passed |
| Register | no `passwordHash` in the response; short password 400; duplicate email 409 | Passed |
| Wrong password vs unknown email | both 401 with the **same** message | Passed |
| Logout, then reuse the old cookie | not signed in (revoked on the server) | Passed |
| Non-player reads a game (IDOR) | 403; after joining, 200 | Passed |
| Joining twice | still 2 players (unique index) | Passed |
| Unknown difficulty | 400 | Passed |
| Leaderboard `limit=500` | at most 50 rows, no emails | Passed |

## 4. Manual and Browser Tests

Recorded per phase in `VIDEO-NOTES.md`:
- multiplayer attribution (Phase 2)
- leaderboard ranking (Phase 3)
- race flow with 2 players (Phase 4)
- refresh/rejoin, backend restart and reconnect, 375px mobile layout (Phase 5)

## 5. Test Evidence

Keep screenshots of the passing test run and the browser checks for the video. Re-run the suite after any change to the game or auth code.
