// GET /api/setup/token-check?key=<GOOGLE_CLIENT_SECRET>
// Setup diagnostic: tries to mint an access token from the stored refresh token
// and reports Google's exact response (e.g. "Token has been expired or revoked"
// vs "invalid_client"). Gated behind the client secret. Read-only.

import { NextRequest, NextResponse } from "next/server";
import { oauthClient } from "@/lib/calendar/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.GOOGLE_CLIENT_SECRET || key !== process.env.GOOGLE_CLIENT_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }

  const info = {
    clientIdTail: (process.env.GOOGLE_CLIENT_ID || "").slice(-14),
    clientSecretSet: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    refreshTokenLen: (process.env.GOOGLE_REFRESH_TOKEN || "").length,
    refreshTokenHead: (process.env.GOOGLE_REFRESH_TOKEN || "").slice(0, 5),
  };

  try {
    const auth = oauthClient();
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const tok = await auth.getAccessToken();
    return NextResponse.json({ ok: Boolean(tok.token), ...info });
  } catch (err) {
    const e = err as { message?: string; response?: { data?: unknown } };
    return NextResponse.json({ ok: false, ...info, error: e.message, google: e.response?.data ?? null });
  }
}
