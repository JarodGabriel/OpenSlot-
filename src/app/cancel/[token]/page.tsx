"use client";

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { fmtDateFull, fmtTime } from "@/lib/timezone";
import { detectTz, buildTzOptions, tzLabelFor } from "@/lib/tzOptions";
import { config } from "@/lib/config";

interface EventInfo {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  attendeeEmail?: string;
}

type State = "loading" | "ready" | "cancelling" | "done" | "error";

export default function CancelPage() {
  const token = String(useParams().token ?? "");
  const tz = useMemo(() => detectTz(), []);
  const tzLabel = useMemo(() => tzLabelFor(buildTzOptions(tz), tz), [tz]);

  const [state, setState] = useState<State>("loading");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/cancel?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Couldn’t load the meeting.");
        setEvent(data.event);
        setState("ready");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    })();
  }, [token]);

  const cancel = async () => {
    setState("cancelling");
    try {
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to cancel.");
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const when = event
    ? `${fmtTime(new Date(event.startISO).getTime(), tz)} – ${fmtTime(new Date(event.endISO).getTime(), tz)}, ${fmtDateFull(new Date(event.startISO), tz)}`
    : "";

  return (
    <Shell>
      {state === "loading" && <Muted>Loading…</Muted>}
      {state === "error" && (
        <>
          <Title>Something went wrong</Title>
          <Sub>{error}</Sub>
        </>
      )}
      {state === "done" && (
        <>
          <Badge tone="muted">✕</Badge>
          <Title>Meeting cancelled</Title>
          <Sub>Your meeting with {config.hostName} has been cancelled and they’ve been notified.</Sub>
        </>
      )}
      {(state === "ready" || state === "cancelling") && event && (
        <>
          <Title>Cancel this meeting?</Title>
          <div style={recapCard}>
            <div style={recapHead}>{event.title || `Meeting with ${config.hostName}`}</div>
            <div style={recapRow}>{when}</div>
            <div style={{ ...recapRow, borderBottom: "none" }}>{tzLabel}</div>
          </div>
          <div style={{ display: "flex", gap: 11, marginTop: 22 }}>
            <button onClick={cancel} disabled={state === "cancelling"} style={dangerBtn(state === "cancelling")}>
              {state === "cancelling" ? "Cancelling…" : "Cancel meeting"}
            </button>
            <a href="/" style={secondaryBtn}>
              Keep it
            </a>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "40px 16px",
        background: "#eef1f5",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily: "'Public Sans',-apple-system,'Segoe UI',sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          border: "1px solid #e7ebf0",
          borderRadius: 16,
          boxShadow: "0 1px 2px rgba(20,40,80,.04), 0 22px 60px rgba(20,40,80,.12)",
          padding: "36px 32px",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 22, fontWeight: 700, color: "#15233a", letterSpacing: "-0.01em" }}>{children}</div>
);
const Sub = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 14, color: "#5a6573", margin: "9px 0 0", lineHeight: 1.5 }}>{children}</div>
);
const Muted = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 14, color: "#9aa3ad" }}>{children}</div>
);
const Badge = ({ children, tone }: { children: ReactNode; tone: "muted" }) => (
  <div
    style={{
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: tone === "muted" ? "#f3f0f0" : "#eafaf0",
      border: "1px solid #e6dede",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto 16px",
      fontSize: 22,
      color: "#b15a5a",
    }}
  >
    {children}
  </div>
);

const recapCard: CSSProperties = {
  textAlign: "left",
  border: "1px solid #e6eaef",
  borderRadius: 13,
  overflow: "hidden",
  marginTop: 18,
};
const recapHead: CSSProperties = {
  padding: "15px 18px",
  borderBottom: "1px solid #eef1f4",
  fontSize: 16,
  fontWeight: 700,
  color: "#15233a",
};
const recapRow: CSSProperties = {
  padding: "13px 18px",
  borderBottom: "1px solid #f0f2f5",
  fontSize: 14,
  color: "#46505c",
  fontWeight: 500,
};
const dangerBtn = (busy: boolean): CSSProperties => ({
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  background: busy ? "#e08a8a" : "#d04646",
  border: "none",
  borderRadius: 10,
  padding: "12px 18px",
  cursor: busy ? "default" : "pointer",
});
const secondaryBtn: CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: "#5a6573",
  background: "#fff",
  border: "1px solid #d4dae1",
  borderRadius: 10,
  padding: "12px 18px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
