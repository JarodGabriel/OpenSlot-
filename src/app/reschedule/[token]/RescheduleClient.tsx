"use client";

import dynamic from "next/dynamic";

const Scheduler = dynamic(() => import("@/components/Scheduler"), {
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

export default function RescheduleClient({ token, durationMin }: { token: string; durationMin: number }) {
  return <Scheduler reschedule={{ token, durationMin }} />;
}
