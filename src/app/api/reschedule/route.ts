// POST /api/reschedule { token, startInst }
// Moves an existing booking to a new time and notifies the guest. The duration
// comes from the signed token, so the new end time can't be tampered with.

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getProvider, isDemoMode } from "@/lib/calendar";
import { verifyBookingToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { token?: string; startInst?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const payload = verifyBookingToken(body.token);
  if (!payload) return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });

  const startInst = Number(body.startInst);
  if (!Number.isFinite(startInst) || startInst <= Date.now()) {
    return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });
  }

  const startISO = new Date(startInst).toISOString();
  const endISO = new Date(startInst + payload.d * 60000).toISOString();

  try {
    await getProvider().updateEventTime(payload.id, startISO, endISO, config.hostTz);
    return NextResponse.json({ ok: true, demo: isDemoMode() });
  } catch (err) {
    console.error("reschedule error:", err);
    return NextResponse.json({ error: "Failed to reschedule the meeting." }, { status: 502 });
  }
}
