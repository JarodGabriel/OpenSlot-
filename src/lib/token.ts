// Signed tokens for reschedule/cancel links. The token carries the event id and
// duration, signed with HMAC-SHA256 so a visitor can't forge a link to cancel or
// move someone else's meeting. The body is readable (not encrypted) — only the
// signature gates the action server-side. Server-only (uses node:crypto).

import crypto from "node:crypto";

export interface BookingToken {
  /** Google event id. */
  id: string;
  /** Duration in minutes (lets the reschedule page lock the length). */
  d: number;
}

function signingSecret(): string {
  return (
    process.env.BOOKING_SIGNING_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "insecure-dev-secret-set-GOOGLE_CLIENT_SECRET"
  );
}

function hmac(body: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function signBookingToken(payload: BookingToken): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyBookingToken(token: string | undefined): BookingToken | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload?.id === "string" && typeof payload?.d === "number") {
      return { id: payload.id, d: payload.d };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Decode the (unverified) duration from a token body — safe for the client to
 *  read to pre-set the reschedule UI. Never use for authorization. */
export function readDurationUnsafe(token: string | undefined): number | null {
  try {
    const body = (token || "").split(".")[0];
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof payload?.d === "number" ? payload.d : null;
  } catch {
    return null;
  }
}
