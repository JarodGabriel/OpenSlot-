// GET  /api/cancel?token=...  -> event details (to confirm before cancelling)
// POST /api/cancel { token }   -> cancels the event and notifies the guest

import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/calendar";
import { verifyBookingToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const payload = verifyBookingToken(new URL(req.url).searchParams.get("token") ?? undefined);
  if (!payload) return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });

  try {
    const event = await getProvider().getEvent(payload.id);
    if (!event) return NextResponse.json({ error: "This meeting no longer exists." }, { status: 404 });
    return NextResponse.json({ event });
  } catch (err) {
    console.error("cancel lookup error:", err);
    return NextResponse.json({ error: "Couldn’t load the meeting." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let token: string | undefined;
  try {
    token = (await req.json())?.token;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const payload = verifyBookingToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });

  try {
    await getProvider().cancelEvent(payload.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel the meeting." }, { status: 502 });
  }
}
