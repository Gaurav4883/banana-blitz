# Banana Blitz — System Architecture

## 1. Overview

Banana Blitz is a browser-based puzzle game being developed with a separate frontend and backend.

The initial architecture contains:

- Next.js and React for the user interface.
- TypeScript for frontend and backend development.
- Node.js and Express for the backend API.
- The Banana API as the external puzzle data source.

PostgreSQL, Prisma, authentication, and Socket.IO are planned additions and will be documented as they are implemented.

## 2. Initial Communication Flow

1. A player interacts with the Next.js frontend.
2. The frontend sends an HTTP request to the Express backend.
3. The backend processes the request.
4. The backend returns a JSON response.
5. The frontend updates its interface based on the response.

## 3. Planned Banana API Integration

The Express backend will communicate with the external Banana API.

The backend will process the external response and provide the frontend with the information needed to display a puzzle.

Answer validation and scoring will be handled on the server. The correct answer must not be exposed unnecessarily to the browser.

## 4. Planned Expansion

The architecture will be extended to support:

- PostgreSQL persistence through Prisma.
- User authentication and protected endpoints.
- Game history and leaderboards.
- Socket.IO communication for real-time multiplayer rooms.

The architecture documentation will be updated as these components become operational.
