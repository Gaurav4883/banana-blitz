// AI-assisted (Claude, Anthropic): cookie + auth middleware, reviewed by me.
import { CookieOptions, NextFunction, Request, Response } from "express";
import { AuthUser, SESSION_TTL_MS, authService } from "./auth.service";

export const SESSION_COOKIE = "bb_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// httpOnly = javascript in the browser can't read the token, so an XSS
// bug can't just steal it. sameSite lax blocks most CSRF from other sites.
export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_MS,
  path: "/",
};

// Tiny cookie parser so we don't need the cookie-parser package.
// Also used by the socket handshake which gives us the raw header.
export function readSessionCookie(header: string | undefined) {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }

  return undefined;
}

export function getRequestToken(req: Request) {
  return readSessionCookie(req.headers.cookie);
}

/** Looks up the user if there is a cookie but never blocks the request. */
export async function loadUser(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    req.user =
      (await authService.getUserFromToken(getRequestToken(req))) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

/** Use on routes that need a logged in user (guest counts too). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Please sign in or play as a guest first",
    });
  }

  next();
}
