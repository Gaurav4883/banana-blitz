// AI-assisted (Claude, Anthropic): email sending with nodemailer, reviewed by me.
import nodemailer, { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

/*
 * Real SMTP if SMTP_HOST is set in .env (e.g. Gmail with an app password).
 * If it isn't set, in development we make a free Ethereal test inbox.
 * Ethereal catches the email instead of delivering it and prints a link to view it.
 */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is TLS from the start, 587 upgrades with STARTTLS
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    return transporter;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SMTP_HOST is not configured");
  }

  const testAccount = await nodemailer.createTestAccount();
  console.log(
    `No SMTP_HOST set, using Ethereal test inbox ${testAccount.user}`,
  );

  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  return transporter;
}

export async function sendVerificationEmail(
  to: string,
  displayName: string | null,
  code: string,
) {
  const mailer = await getTransporter();

  const info = await mailer.sendMail({
    from: process.env.MAIL_FROM || "Banana Blitz <no-reply@bananablitz.local>",
    to,
    subject: `Your Banana Blitz code: ${code}`,
    text: `Hi ${displayName ?? "there"},\n\nYour verification code is ${code}\nIt expires in 15 minutes.\n\nIf you didn't sign up for Banana Blitz you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(displayName ?? "there")},</p>
<p>Your verification code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
<p>It expires in 15 minutes.</p>
<p style="color:#888">If you didn't sign up for Banana Blitz you can ignore this email.</p>`,
  });

  // only gives a URL for Ethereal emails, false for real SMTP
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`Verification email preview: ${preview}`);
}

// display names are already restricted, but escape anyway since it goes into HTML
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
