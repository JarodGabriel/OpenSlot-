"use client";

// Client boundary that renders the Scheduler client-only (the scheduler relies
// on the visitor's local time zone and clock, so SSR would mismatch). The host
// schedule config is read on the server and passed in as props.

import dynamic from "next/dynamic";
import type { HostSchedule, RescheduleContext } from "./Scheduler";

const Scheduler = dynamic(() => import("./Scheduler"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#eef1f5",
        color: "#9aa3ad",
        fontFamily: "'Public Sans',-apple-system,'Segoe UI',sans-serif",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  ),
});

export default function SchedulerClient(props: {
  schedule: HostSchedule;
  reschedule?: RescheduleContext;
}) {
  return <Scheduler {...props} />;
}
