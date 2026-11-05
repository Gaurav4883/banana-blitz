// AI-assisted (Claude, Anthropic): API / security tests with supertest, reviewed by me.
//
// These run the real Express app against the real database (docker compose
// up first). They check the security rules end to end: no cookie = 401, not
// a player = 403, cookies are httpOnly, logout really kills the session, and
// no emails or password hashes ever come back.
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

// don't send real emails from tests
vi.mock("../src/modules/auth/mailer", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import app from "../src/app";
import { prisma } from "../src/config/prisma";

const api = request(app);
const run = Date.now().toString(36);
const createdEmails: string[] = [];
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];

/** signs up a guest and returns the cookie to send with later requests */
async function guest(name: string) {
  const res = await api
    .post("/api/v1/auth/guest")
    .send({ displayName: `${name}${run.slice(-4)}` });

  expect(res.status).toBe(201);
  createdUserIds.push(res.body.data.id);

  const cookie = res.headers["set-cookie"] as unknown as string[];
  return { cookie, user: res.body.data };
}

afterAll(async () => {
  await prisma.gameSession.deleteMany({
    where: { id: { in: createdSessionIds } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { in: createdUserIds } }, { email: { in: createdEmails } }],
    },
  });
  await prisma.$disconnect();
});

describe("basics", () => {
  it("health check reports the database", async () => {
    const res = await api.get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe("connected");
  });

  it("unknown routes get JSON 404, not an HTML page", async () => {
    const res = await api.get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("broken JSON body gets a clean 400", async () => {
    const res = await api
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid JSON/);
  });
});

describe("authentication", () => {
  it("game routes need a session (401 without cookie)", async () => {
    const res = await api.post("/api/v1/game/sessions");
    expect(res.status).toBe(401);
  });

  it("player stats and leaderboard need a session too", async () => {
    expect((await api.get("/api/v1/players/leaderboard")).status).toBe(401);
    expect((await api.get("/api/v1/players/me/stats")).status).toBe(401);
  });

  it("rejects a display name with HTML in it", async () => {
    const res = await api
      .post("/api/v1/auth/guest")
      .send({ displayName: "<script>" });
    expect(res.status).toBe(400);
  });

  it("guest sign in sets an httpOnly, SameSite=Lax cookie", async () => {
    const { cookie, user } = await guest("Cookie");
    const header = cookie.join(";");

    expect(header).toMatch(/bb_session=/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(user.isGuest).toBe(true);
  });

  it("register never returns the password hash and rejects short passwords", async () => {
    const email = `t${run}@example.test`;
    createdEmails.push(email);

    const short = await api
      .post("/api/v1/auth/register")
      .send({ displayName: "Shorty", email, password: "123" });
    expect(short.status).toBe(400);

    const res = await api
      .post("/api/v1/auth/register")
      .send({ displayName: "Regi", email, password: "banana123" });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|banana123/);

    const again = await api
      .post("/api/v1/auth/register")
      .send({ displayName: "Regi", email, password: "banana123" });
    expect(again.status).toBe(409);
  });

  it("wrong password and unknown email give the same answer", async () => {
    const email = createdEmails[0];

    const wrongPassword = await api
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" });
    const unknownEmail = await api
      .post("/api/v1/auth/login")
      .send({ email: `nobody${run}@example.test`, password: "whatever1" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it("logout really revokes the session server side", async () => {
    const { cookie } = await guest("Logout");

    expect((await api.get("/api/v1/auth/me").set("Cookie", cookie)).body.data)
      .not.toBeNull();

    await api.post("/api/v1/auth/logout").set("Cookie", cookie);

    // re-sending the OLD cookie (like an attacker who copied it) must fail
    const after = await api.get("/api/v1/auth/me").set("Cookie", cookie);
    expect(after.body.data).toBeNull();
  });
});

describe("session ownership (IDOR)", () => {
  it("only players of a game can see it, joining makes you one", async () => {
    const host = await guest("Host");
    const other = await guest("Other");

    const created = await api
      .post("/api/v1/game/sessions")
      .set("Cookie", host.cookie)
      .send({ difficulty: "HARD" });
    expect(created.status).toBe(201);
    expect(created.body.data.difficulty).toBe("HARD");
    const sessionId = created.body.data.id;
    createdSessionIds.push(sessionId);

    // knowing the id isn't enough
    const peek = await api
      .get(`/api/v1/game/sessions/${sessionId}`)
      .set("Cookie", other.cookie);
    expect(peek.status).toBe(403);

    const join = await api
      .post(`/api/v1/game/sessions/${sessionId}/join`)
      .set("Cookie", other.cookie);
    expect(join.status).toBe(200);
    expect(join.body.data.players).toHaveLength(2);

    // joining twice doesn't make a duplicate player (unique index)
    await api
      .post(`/api/v1/game/sessions/${sessionId}/join`)
      .set("Cookie", other.cookie);
    expect(
      await prisma.sessionPlayer.count({ where: { gameSessionId: sessionId } }),
    ).toBe(2);
  });

  it("rejects an unknown difficulty", async () => {
    const { cookie } = await guest("Diff");
    const res = await api
      .post("/api/v1/game/sessions")
      .set("Cookie", cookie)
      .send({ difficulty: "IMPOSSIBLE" });
    expect(res.status).toBe(400);
  });
});

describe("leaderboard privacy", () => {
  it("never includes emails", async () => {
    const { cookie } = await guest("Board");
    const res = await api
      .get("/api/v1/players/leaderboard?limit=500")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(50); // limit is clamped
    expect(JSON.stringify(res.body)).not.toMatch(/@/);
  });
});
