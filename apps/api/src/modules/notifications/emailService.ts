import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

/**
 * Creates a Nodemailer transport from environment variables.
 * Supports any SMTP provider (Gmail, Brevo, SendGrid SMTP, Mailgun, etc.)
 *
 * Required env vars (add to apps/api/.env):
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 587
 *   SMTP_USER      your SMTP username / email
 *   SMTP_PASS      your SMTP password / app password
 *   EMAIL_FROM     e.g. "KARMA Signals <no-reply@yourdomain.com>"
 */
function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export interface SendInvitationEmailParams {
  toEmail: string;
  toName: string;
  orgName?: string;
  apkDownloadUrl?: string;
}

/**
 * Sends an invitation email directly from the KARMA API.
 * This replaces the Clerk-hosted invitation flow, which can be slow to deliver.
 *
 * The flow after sending:
 * 1. Client receives this email
 * 2. Client downloads the KARMA APK
 * 3. Client opens the app and types their email (the same one this was sent to)
 * 4. App sends OTP (via Clerk sign-up — creates Clerk account on the fly)
 * 5. Client verifies OTP → API's on-demand provisioning links them → instant access
 */
export async function sendInvitationEmail(params: SendInvitationEmailParams): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    // Graceful degradation: log the invite details so the admin can manually inform the client.
    // Don't throw — the admin client record is already created in DB.
    console.warn(
      '[KARMA] SMTP not configured — skipping invitation email. ' +
        `Client ${params.toEmail} was added to the system. ` +
        'Configure SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable automatic invite emails.',
    );
    return;
  }

  const transport = createTransport();
  const orgLabel = params.orgName ? ` to ${params.orgName}` : '';
  const downloadLink = params.apkDownloadUrl ?? 'https://karma-signals.app/download';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to KARMA</title>
  <style>
    body { margin: 0; padding: 0; background: #0B0D0F; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #E7E9EA; }
    .container { max-width: 520px; margin: 0 auto; padding: 40px 24px; }
    .logo { font-size: 24px; font-weight: 700; letter-spacing: 1px; color: #E7E9EA; }
    .tagline { font-size: 11px; letter-spacing: 2px; color: #8A9199; font-family: monospace; margin-top: 2px; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 28px; margin-top: 28px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
    p { font-size: 15px; line-height: 1.6; color: #8A9199; margin: 8px 0; }
    .highlight { color: #E7E9EA; }
    .cta { display: inline-block; margin-top: 20px; padding: 14px 28px; background: #F5B942; color: #0B0D0F; font-weight: 700; font-size: 15px; border-radius: 10px; text-decoration: none; }
    .steps { margin-top: 24px; padding-left: 0; list-style: none; }
    .steps li { padding: 6px 0; font-size: 14px; color: #8A9199; }
    .steps li::before { content: "→ "; color: #F5B942; }
    .footer { margin-top: 32px; font-size: 12px; color: #8A9199; }
    .email-note { margin-top: 16px; background: rgba(91,157,255,0.1); border: 1px solid rgba(91,157,255,0.2); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #5B9DFF; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">KARMA</div>
    <div class="tagline">TRADING SIGNALS</div>

    <div class="card">
      <h1>You've been invited${orgLabel}! 🎯</h1>
      <p>Hi <span class="highlight">${params.toName}</span>,</p>
      <p>You now have access to KARMA — a premium, real-time trading signals platform. Your admin has set up your account and you're ready to start.</p>

      <a href="${downloadLink}" class="cta">Download KARMA App</a>

      <ul class="steps">
        <li>Download and install the KARMA APK</li>
        <li>Open the app and type <span class="highlight">${params.toEmail}</span></li>
        <li>Enter the 6-digit code sent to your email</li>
        <li>You're in — live signals start immediately</li>
      </ul>

      <div class="email-note">
        <strong>Important:</strong> Sign in with <strong>${params.toEmail}</strong> — this is the email your account is linked to.
      </div>
    </div>

    <div class="footer">
      <p>KARMA Trading Signals · If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from: env.EMAIL_FROM || `"KARMA Signals" <${env.SMTP_USER}>`,
    to: `"${params.toName}" <${params.toEmail}>`,
    subject: `You're invited to KARMA Trading Signals${orgLabel}`,
    html,
    text: `
Hi ${params.toName},

You have been invited${orgLabel} to KARMA Trading Signals.

Download the KARMA app: ${downloadLink}

Steps:
1. Download and install the KARMA APK
2. Open the app and enter your email: ${params.toEmail}
3. Enter the 6-digit code sent to your email
4. You're in — live signals start immediately

Important: Sign in with ${params.toEmail} — this is the email your account is linked to.

KARMA Trading Signals
    `.trim(),
  });
}
