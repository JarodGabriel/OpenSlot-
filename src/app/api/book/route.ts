// POST /api/book
// Body: { durationMin, startInst, name, email, note?, tz? }
// Creates the event (with a Meet link) on the host's calendar and emails the
// invite. Re-validates everything server-side — never trust the client.

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getProvider, isDemoMode } from "@/lib/calendar";
import { signBookingToken } from "@/lib/token";

const EMAIL_RE = /.+@.+\..+/;

interface BookBody {
  durationMin?: number;
  startInst?: number;
  name?: string;
  email?: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  let body: BookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const durationMin = Number(body.durationMin);
  const startInst = Number(body.startInst);
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const note = body.note ?? "";

  if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 24 * 60) {
    return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
  }
  if (!Number.isFinite(startInst) || startInst <= Date.now()) {
    return NextResponse.json({ error: "Selected time is in the past." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  const startISO = new Date(startInst).toISOString();
  const endISO = new Date(startInst + durationMin * 60000).toISOString();
  // Include the guest's name so the host can tell bookings apart at a glance
  // (otherwise every event on the host's calendar reads identically).
  const title = `${durationMin} Minute Meeting — ${name} & ${config.hostName}`;

  // Choose the event id up front (hex is a valid Google event id) so we can mint
  // reschedule/cancel links and embed them in the invite at creation time.
  const eventId = crypto.randomBytes(16).toString("hex");
  const token = signBookingToken({ id: eventId, d: durationMin });
  const origin = req.nextUrl.origin;
  const rescheduleUrl = `${origin}/reschedule/${token}`;
  const cancelUrl = `${origin}/cancel/${token}`;

  const description = [
    note.trim(),
    "Need to make changes to this meeting?",
    `Reschedule: ${rescheduleUrl}`,
    `Cancel: ${cancelUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const provider = getProvider();
    const result = await provider.createEvent({
      id: eventId,
      title,
      startISO,
      endISO,
      hostTz: config.hostTz,
      attendeeEmail: email,
      attendeeName: name,
      note: description,
    });
    return NextResponse.json({
      ok: true,
      demo: isDemoMode(),
      eventId: result.id,
      meetingUrl: result.meetingUrl ?? null,
      summary: title,
      rescheduleUrl,
      cancelUrl,
    });
  } catch (err) {
    console.error("book error:", err);
    return NextResponse.json({ error: "Failed to create the event." }, { status: 502 });
  }
}
