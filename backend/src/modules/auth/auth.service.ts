// AI-assisted (Claude, Anthropic): auth service, reviewed and tested by me.
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { hashPassword, verifyPassword } from "./password";
import { sendVerificationEmail } from "./mailer";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;

export interface AuthUser {
  id: string;
  displayName: string | null;
  email: string | null;
  isGuest: boolean;
  role: "PLAYER" | "ADMIN";
  emailVerifiedAt: Date | null;
}

const userSelect = {
  id: true,
  displayName: true,
  email: true,
  isGuest: true,
  role: true,
  emailVerifiedAt: true,
} as const;

// Used when the email does not exist, so a failed login takes about the
// same time either way and nobody can guess which emails are registered.
let dummyHash: string | null = null;

// The raw token only lives in the cookie. The DB keeps a sha256 of it,
// so a leaked database dump can't be used to log in as anyone.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cleanDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_DISPLAY_NAME");

  const name = value.trim().replace(/\s+/g, " ");

  // 2-20 chars, letters numbers spaces _ and - only. Stops people putting
  // HTML or really long names in the lobby.
  if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(name)) {
    throw new Error("INVALID_DISPLAY_NAME");
  }

  return name;
}

function cleanEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_EMAIL");

  const email = value.trim().toLowerCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }

  return email;
}

function checkPassword(value: unknown): string {
  // max length too, scrypt on a huge string is an easy way to burn CPU
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new Error("INVALID_PASSWORD");
  }

  return value;
}

export class AuthService {
  async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");

    await prisma.authSession.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return token;
  }

  async getUserFromToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, expiresAt: true, user: { select: userSelect } },
    });

    if (!session) return null;

    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.authSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    return session.user;
  }

  // Logout deletes the row, so the token is dead straight away.
  // (With a JWT we couldn't do this without keeping a blocklist.)
  async revokeSession(token: string | undefined) {
    if (!token) return;
    await prisma.authSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  async createGuest(displayName: unknown) {
    const user = await prisma.user.create({
      data: { displayName: cleanDisplayName(displayName), isGuest: true },
      select: userSelect,
    });

    return { user, token: await this.createSession(user.id) };
  }

  /**
   * Register with email + password. If the person is already playing as a
   * guest we upgrade that same user row, so their games stay with them.
   */
  async register(
    input: { displayName?: unknown; email?: unknown; password?: unknown },
    currentUser: AuthUser | null,
  ) {
    const email = cleanEmail(input.email);
    const password = checkPassword(input.password);
    const passwordHash = await hashPassword(password);

    const upgradeGuest = currentUser?.isGuest === true;
    const displayName =
      input.displayName === undefined && upgradeGuest
        ? currentUser.displayName
        : cleanDisplayName(input.displayName);

    try {
      const data = { email, passwordHash, displayName, isGuest: false };

      const user = upgradeGuest
        ? await prisma.user.update({
            where: { id: currentUser.id },
            data,
            select: userSelect,
          })
        : await prisma.user.create({ data, select: userSelect });

      // the old guest token gets replaced by a new one
      if (upgradeGuest) {
        await prisma.authSession.deleteMany({ where: { userId: user.id } });
      }

      const token = await this.createSession(user.id);

      // A failed email shouldn't fail the whole sign up, the account is
      // already made. The player can press "resend" on the verify screen.
      try {
        await this.sendVerificationCode(user.id, email, user.displayName);
      } catch (mailError) {
        console.error("Verification email failed:", mailError);
      }

      return { user, token };
    } catch (error) {
      // unique constraint on email
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error("EMAIL_TAKEN");
      }
      throw error;
    }
  }

  async login(input: { email?: unknown; password?: unknown }) {
    if (typeof input.email !== "string" || typeof input.password !== "string") {
      throw new Error("INVALID_CREDENTIALS");
    }

    const user = await prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: { ...userSelect, passwordHash: true },
    });

    if (!user?.passwordHash) {
      dummyHash ??= await hashPassword("not-a-real-password");
      await verifyPassword(input.password, dummyHash);
      throw new Error("INVALID_CREDENTIALS");
    }

    const ok = await verifyPassword(input.password, user.passwordHash);

    // same error for wrong email and wrong password on purpose
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    const { passwordHash: _hash, ...safeUser } = user;

    return { user: safeUser, token: await this.createSession(user.id) };
  }

  /**
   * Makes a new 6 digit code, saves its hash and emails it. Any older code
   * stops working because its hash gets overwritten.
   */
  private async sendVerificationCode(
    userId: string,
    email: string,
    displayName: string | null,
  ) {
    // randomInt uses crypto randomness, Math.random would be guessable
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailCodeHash: hashToken(code),
        emailCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        emailCodeSentAt: new Date(),
        emailCodeAttempts: 0,
      },
    });

    await sendVerificationEmail(email, displayName, code);
  }

  async resendVerification(currentUser: AuthUser) {
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { email: true, emailVerifiedAt: true, emailCodeSentAt: true },
    });

    if (!user?.email) throw new Error("NO_EMAIL");
    if (user.emailVerifiedAt) throw new Error("ALREADY_VERIFIED");

    // stops someone using us to spam an inbox
    if (
      user.emailCodeSentAt &&
      Date.now() - user.emailCodeSentAt.getTime() < EMAIL_RESEND_COOLDOWN_MS
    ) {
      throw new Error("RESEND_TOO_SOON");
    }

    try {
      await this.sendVerificationCode(
        currentUser.id,
        user.email,
        currentUser.displayName,
      );
    } catch (error) {
      console.error("Verification email failed:", error);
      throw new Error("EMAIL_SEND_FAILED");
    }
  }

  async verifyEmail(currentUser: AuthUser, code: unknown) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      throw new Error("INVALID_CODE");
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        emailVerifiedAt: true,
        emailCodeHash: true,
        emailCodeExpiresAt: true,
        emailCodeAttempts: true,
      },
    });

    if (!user) throw new Error("INVALID_CODE");
    if (user.emailVerifiedAt) throw new Error("ALREADY_VERIFIED");

    if (
      !user.emailCodeHash ||
      !user.emailCodeExpiresAt ||
      user.emailCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new Error("CODE_EXPIRED");
    }

    // 1 in a million per guess, and only 5 guesses per code
    if (user.emailCodeAttempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new Error("TOO_MANY_CODE_ATTEMPTS");
    }

    const matches = timingSafeEqual(
      Buffer.from(hashToken(code.trim())),
      Buffer.from(user.emailCodeHash),
    );

    if (!matches) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: { emailCodeAttempts: { increment: 1 } },
      });
      throw new Error("INVALID_CODE");
    }

    return prisma.user.update({
      where: { id: currentUser.id },
      data: {
        emailVerifiedAt: new Date(),
        // used up, clear it so it can't be used again
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        emailCodeAttempts: 0,
      },
      select: userSelect,
    });
  }
}

export const authService = new AuthService();
