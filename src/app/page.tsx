// Server component: reads the host's schedule config (time zone + working hours)
// from the environment and hands it to the client scheduler, so the calendar can
// correctly grey out days whose booking window has already closed.

import { config } from "@/lib/config";
import SchedulerClient from "@/components/SchedulerClient";

export default function Page() {
  return (
    <SchedulerClient
      schedule={{
        hostTz: config.hostTz,
        workStartHour: config.workStartHour,
        workEndHour: config.workEndHour,
        allowWeekends: config.allowWeekends,
      }}
    />
  );
}
