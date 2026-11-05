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

## 5. Future Decisions

Document additional decisions when database persistence, authentication, sessions, authorization, multiplayer, and advanced graphics are implemented.

For each significant decision, record the alternatives considered, benefits, limitations, and security implications.
