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

## 3. Future Tests

Add test cases when the corresponding features are implemented.

Planned areas include:

- Banana API success and failure responses.
- Invalid or unexpected API data.
- Answer validation and scoring.
- Authentication and logout.
- Unauthorized access to protected endpoints.
- Database failures.
- Multiplayer disconnections and reconnections.

## 4. Test Evidence

Where appropriate, retain genuine screenshots, terminal output, automated test results, and demonstration notes.

Update the results whenever implementation changes make a previous test obsolete or require it to be repeated.

## Banana Service Automated Tests

Testing framework: Vitest

The Banana service was tested using mocked external API responses to avoid depending on the availability of the third-party Banana API.

### Test cases

| Test case            | Expected result                               |
| -------------------- | --------------------------------------------- |
| Generate puzzle      | Returns a puzzle ID and image URL             |
| Hide solution        | Correct answer is not exposed to the frontend |
| Correct answer       | Accepts the correct answer                    |
| Incorrect answer     | Rejects the answer and decreases attempts     |
| Unknown puzzle       | Rejects an invalid puzzle ID                  |
| External API failure | Handles an HTTP 503 response                  |
| Invalid JSON         | Rejects malformed API responses               |

### Test execution

Command: `pnpm --dir backend test`

Status: Update after running the tests.

Build command: `pnpm --dir backend build`

Build status: Update after running the build.
