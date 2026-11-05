// AI-assisted (Claude, Anthropic): auth routes, reviewed by me.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "./auth.controller";
import { requireAuth } from "./auth.middleware";

const router = Router();

// Slows down password guessing. 20 tries per 15 min per IP is plenty for a
// real person (and for testing with a few tabs open).
// Limitation: the store is in memory, so it resets on restart and isn't
// shared between servers. Would need a Redis store for more than one instance.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, try again later" },
});

router.post("/guest", credentialLimiter, authController.guest);
router.post("/register", credentialLimiter, authController.register);
router.post("/login", credentialLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/me", authController.me);
router.post(
  "/verify-email",
  requireAuth,
  credentialLimiter,
  authController.verifyEmail,
);
router.post(
  "/resend-verification",
  requireAuth,
  credentialLimiter,
  authController.resendVerification,
);

export default router;
