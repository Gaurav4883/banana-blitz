// AI-assisted (Claude, Anthropic): auth controller, reviewed by me.
import { Request, Response } from "express";
import { authService } from "./auth.service";
import {
  SESSION_COOKIE,
  getRequestToken,
  sessionCookieOptions,
} from "./auth.middleware";

function sendError(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";

  const knownErrors: Record<string, { status: number; message: string }> = {
    INVALID_DISPLAY_NAME: {
      status: 400,
      message:
        "Display name must be 2-20 characters (letters, numbers, spaces, _ or -)",
    },
    INVALID_EMAIL: { status: 400, message: "Please enter a valid email" },
    INVALID_PASSWORD: {
      status: 400,
      message: "Password must be between 8 and 128 characters",
    },
    EMAIL_TAKEN: {
      status: 409,
      message: "An account with this email already exists",
    },
    INVALID_CREDENTIALS: {
      status: 401,
      message: "Email or password is incorrect",
    },
    INVALID_CODE: { status: 400, message: "That code is not right" },
    CODE_EXPIRED: {
      status: 410,
      message: "This code has expired, send a new one",
    },
    TOO_MANY_CODE_ATTEMPTS: {
      status: 429,
      message: "Too many wrong codes, send a new one",
    },
    ALREADY_VERIFIED: { status: 409, message: "Email is already verified" },
    NO_EMAIL: { status: 400, message: "This account has no email" },
    RESEND_TOO_SOON: {
      status: 429,
      message: "Please wait a minute before asking for another code",
    },
    EMAIL_SEND_FAILED: {
      status: 502,
      message: "Couldn't send the email right now, try again soon",
    },
  };

  const known = knownErrors[code];

  if (known) {
    return res
      .status(known.status)
      .json({ success: false, message: known.message });
  }

  console.error("Auth API error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
  });
}

function signIn(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

export const authController = {
  async guest(req: Request, res: Response) {
    try {
      // drop any older session first so we don't leave junk rows around
      await authService.revokeSession(getRequestToken(req));

      const { user, token } = await authService.createGuest(
        req.body?.displayName,
      );
      signIn(res, token);

      return res
        .status(201)
        .json({ success: true, message: "Playing as guest", data: user });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { user, token } = await authService.register(
        req.body ?? {},
        req.user ?? null,
      );

      if (!req.user?.isGuest) {
        await authService.revokeSession(getRequestToken(req));
      }

      signIn(res, token);

      return res
        .status(201)
        .json({ success: true, message: "Account created", data: user });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { user, token } = await authService.login(req.body ?? {});

      await authService.revokeSession(getRequestToken(req));
      signIn(res, token);

      return res
        .status(200)
        .json({ success: true, message: "Signed in", data: user });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async logout(req: Request, res: Response) {
    try {
      await authService.revokeSession(getRequestToken(req));

      // clearCookie needs the same options (minus maxAge) or the browser keeps it
      const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions;
      res.clearCookie(SESSION_COOKIE, clearOptions);

      return res
        .status(200)
        .json({ success: true, message: "Signed out", data: null });
    } catch (error) {
      return sendError(res, error);
    }
  },

  me(req: Request, res: Response) {
    // 200 with null instead of 401 here, "not signed in" is a normal state
    // for the home page and not an error.
    return res.status(200).json({
      success: true,
      message: req.user ? "Signed in" : "Not signed in",
      data: req.user ?? null,
    });
  },

  async verifyEmail(req: Request, res: Response) {
    try {
      const user = await authService.verifyEmail(req.user!, req.body?.code);
      return res
        .status(200)
        .json({ success: true, message: "Email verified", data: user });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async resendVerification(req: Request, res: Response) {
    try {
      await authService.resendVerification(req.user!);
      return res
        .status(200)
        .json({
          success: true,
          message: "A new code is on its way",
          data: null,
        });
    } catch (error) {
      return sendError(res, error);
    }
  },
};
