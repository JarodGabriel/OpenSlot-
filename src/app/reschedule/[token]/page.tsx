// Reschedule a booking: decodes the locked duration from the token (server-side)
// then renders the scheduler in reschedule mode. The token is re-verified for
// real when the new time is submitted to /api/reschedule.

import { readDurationUnsafe } from "@/lib/token";
import RescheduleClient from "./RescheduleClient";

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const durationMin = readDurationUnsafe(token) ?? 30;
  return <RescheduleClient token={token} durationMin={durationMin} />;
}
