// AI-assisted (Claude, Anthropic): password hashing helpers, reviewed by me.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  p: string,
  s: Buffer,
  k: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

// scrypt is built into Node so no bcrypt/argon2 package needed.
// Stored format is "salt:hash", both hex.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const key = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  const expected = Buffer.from(keyHex, "hex");

  // timingSafeEqual throws if lengths differ, so check that first
  if (expected.length !== key.length) return false;

  // Constant-time compare: response time leaks nothing about the hash.
  return timingSafeEqual(key, expected);
}
