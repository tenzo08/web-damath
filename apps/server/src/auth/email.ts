import { Resend } from 'resend';
import type { FastifyBaseLogger } from 'fastify';

/** Delivers the 6-digit code a new email/password signup must enter before their account actually exists (auth/routes.ts's pending-signup flow). */
export type SignupCodeNotifier = (email: string, code: string) => Promise<void> | void;

/**
 * Real delivery via Resend when `apiKey` is set; otherwise falls back to a structured
 * log line, the same "no email provider configured" shape `notifyActionLink` already
 * uses for password-reset/verify links -- so local dev keeps working with zero setup,
 * and production only starts actually emailing once a deployer sets RESEND_API_KEY.
 */
export function defaultSignupCodeNotifier(apiKey: string | undefined, from: string, log: FastifyBaseLogger): SignupCodeNotifier {
  if (!apiKey) {
    return (email, code) => log.info({ email, code }, 'signup verification code (no RESEND_API_KEY configured — logged instead)');
  }
  const resend = new Resend(apiKey);
  return async (email, code) => {
    await resend.emails.send({
      from,
      to: email,
      subject: 'Your Damath verification code',
      text: `Your verification code is ${code}. It expires in 15 minutes. If you didn't request this, ignore this email.`,
    });
  };
}
