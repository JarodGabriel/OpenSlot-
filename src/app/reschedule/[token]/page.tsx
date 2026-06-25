// Reschedule a booking: decodes the locked duration from the token (server-side)
// then renders the scheduler in reschedule mode. The token is re-verified for
// real when the new time is submitted to /api/reschedule.

import { config } from "@/lib/config";
import { readDurationUnsafe } from "@/lib/token";
import SchedulerClient from "@/components/SchedulerClient";

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const durationMin = readDurationUnsafe(token) ?? 30;
  return (
    <SchedulerClient
      schedule={{
        hostTz: config.hostTz,
        workStartHour: config.workStartHour,
        workEndHour: config.workEndHour,
        allowWeekends: config.allowWeekends,
      }}
      reschedule={{ token, durationMin }}
    />
  );
}
