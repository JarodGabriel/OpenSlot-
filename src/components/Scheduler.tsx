"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { config } from "@/lib/config";
import {
  DURATIONS,
  DEFAULT_DURATION,
  findDuration,
  hexAlpha,
  type DurationKey,
} from "@/lib/durations";
import { fmtDateFull, fmtTime } from "@/lib/timezone";
import { buildTzOptions, detectTz, tzLabelFor } from "@/lib/tzOptions";
import { buildIcs, icsFilename } from "@/lib/ics";
import {
  CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Video,
} from "./icons";

type Step = "select" | "details" | "done";
interface SelTime {
  inst: number;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const EMAIL_RE = /.+@.+\..+/;
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Stacks the layout below this width. Component is client-only (ssr:false),
// so window is available at first render — lazy-init avoids a desktop flash.
function useIsMobile(breakpoint = 760) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return isMobile;
}

export interface RescheduleContext {
  token: string;
  durationMin: number;
}

export default function Scheduler({ reschedule }: { reschedule?: RescheduleContext } = {}) {
  const isReschedule = !!reschedule;
  const isMobile = useIsMobile();
  const now = useMemo(() => new Date(), []);
  const detected = useMemo(() => detectTz(), []);
  const tzOptions = useMemo(() => buildTzOptions(detected), [detected]);

  // In reschedule mode the length is fixed by the original booking.
  const initialDuration: DurationKey = reschedule
    ? ([15, 30, 60] as number[]).includes(reschedule.durationMin)
      ? (reschedule.durationMin as DurationKey)
      : "custom"
    : DEFAULT_DURATION;

  const [step, setStep] = useState<Step>("select");
  const [duration, setDuration] = useState<DurationKey>(initialDuration);
  const [customMins, setCustomMins] = useState(
    reschedule && initialDuration === "custom" ? String(reschedule.durationMin) : "",
  );
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState<SelTime | null>(null);
  const [tz, setTz] = useState(detected);
  const [tzOpen, setTzOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const [slots, setSlots] = useState<number[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [demo, setDemo] = useState(false);

  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [cancelUrl, setCancelUrl] = useState<string | null>(null);
  const [rescheduleUrl, setRescheduleUrl] = useState<string | null>(null);
  const [rescheduled, setRescheduled] = useState(false);

  const active = findDuration(duration);
  const accent = active.color;
  const tint = active.tint;
  const durMins = duration === "custom" ? parseInt(customMins, 10) || 0 : duration;
  const meetingTitle = `${duration === "custom" ? customMins || "Custom" : durMins} Minute Meeting`;

  // ---- availability fetch (debounced; race-safe) --------------------------
  const reqId = useRef(0);
  useEffect(() => {
    if (step !== "select" || !selDate || durMins <= 0) {
      setSlots([]);
      return;
    }
    const id = ++reqId.current;
    setLoadingSlots(true);
    setSlotsError(false);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/availability?date=${dateKey(selDate)}&durationMin=${durMins}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        if (id !== reqId.current) return; // a newer request superseded this one
        if (!res.ok) throw new Error(data?.error || "failed");
        setSlots(Array.isArray(data.slots) ? data.slots : []);
        setDemo(Boolean(data.demo));
      } catch (e) {
        if ((e as Error).name === "AbortError" || id !== reqId.current) return;
        setSlots([]);
        setSlotsError(true);
      } finally {
        if (id === reqId.current) setLoadingSlots(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [selDate, durMins, step]);

  // ---- actions ------------------------------------------------------------
  const pickDur = (k: DurationKey) => {
    setDuration(k);
    setSelTime(null);
  };
  const pickDate = (d: Date) => {
    setSelDate(d);
    setSelTime(null);
  };
  const prevMonth = () =>
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  const nextMonth = () =>
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });

  const schedule = useCallback(async () => {
    if (!selTime || !name.trim() || !EMAIL_RE.test(email) || durMins <= 0) return;
    setBooking(true);
    setBookError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          durationMin: durMins,
          startInst: selTime.inst,
          name: name.trim(),
          email: email.trim(),
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Booking failed.");
      setMeetingUrl(data.meetingUrl ?? null);
      setCancelUrl(data.cancelUrl ?? null);
      setRescheduleUrl(data.rescheduleUrl ?? null);
      setDemo(Boolean(data.demo));
      setStep("done");
    } catch (e) {
      setBookError((e as Error).message);
    } finally {
      setBooking(false);
    }
  }, [selTime, name, email, note, durMins]);

  const doReschedule = useCallback(async () => {
    if (!selTime || !reschedule) return;
    setBooking(true);
    setBookError(null);
    try {
      const res = await fetch("/api/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: reschedule.token, startInst: selTime.inst }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reschedule failed.");
      setDemo(Boolean(data.demo));
      setRescheduled(true);
      setStep("done");
    } catch (e) {
      setBookError((e as Error).message);
    } finally {
      setBooking(false);
    }
  }, [selTime, reschedule]);

  const reset = () => {
    const n = new Date();
    setStep("select");
    setDuration(DEFAULT_DURATION);
    setCustomMins("");
    setSelDate(null);
    setSelTime(null);
    setName("");
    setEmail("");
    setNote("");
    setBookError(null);
    setMeetingUrl(null);
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
  };

  const downloadIcs = () => {
    if (!selTime) return;
    const ics = buildIcs({ durationMin: durMins || 30, startInst: selTime.inst, name, email, note });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Pre-filled "Add to Google Calendar" template URL — opens the guest's
  // calendar with the event ready to save, instead of downloading a file.
  const googleCalendarUrl = () => {
    if (!selTime) return "#";
    const start = new Date(selTime.inst);
    const end = new Date(selTime.inst + (durMins || 30) * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const details = [meetingUrl ? `Google Meet: ${meetingUrl}` : "", note]
      .filter(Boolean)
      .join("\n\n");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `${durMins || 30} Minute Meeting with ${config.hostName}`,
      dates: `${fmt(start)}/${fmt(end)}`,
      location: meetingUrl || "Google Meet",
    });
    if (details) params.set("details", details);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // ---- derived display ----------------------------------------------------
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth, 1),
  );
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const prevDisabled =
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth <= today.getMonth());

  const summaryWhen = selTime
    ? `${fmtTime(selTime.inst, tz)} – ${fmtTime(selTime.inst + (durMins || 30) * 60000, tz)}, ${fmtDateFull(new Date(selTime.inst), tz)}`
    : "";
  const tzLabel = tzLabelFor(tzOptions, tz);
  const canSchedule = !!(name.trim() && EMAIL_RE.test(email) && selTime && durMins > 0);

  const isDayAvailable = (d: Date) => {
    if (d < today) return false;
    const dow = d.getDay();
    if (!config.allowWeekends && (dow === 0 || dow === 6)) return false;
    return true;
  };

  // ---- styles -------------------------------------------------------------
  const cellStyle = (state: "available" | "selected" | "disabled" | "empty"): CSSProperties => {
    const b: CSSProperties = {
      width: 38,
      height: 38,
      borderRadius: "50%",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 600,
      transition: "all .12s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    };
    if (state === "empty") return { ...b, visibility: "hidden" };
    if (state === "disabled") return { ...b, color: "#c2cad3", cursor: "default", fontWeight: 400 };
    if (state === "selected")
      return { ...b, background: accent, color: "#fff", boxShadow: `0 0 0 3px ${hexAlpha(accent, 0.2)}` };
    return { ...b, background: tint, color: accent };
  };
  const slotStyle = (sel: boolean): CSSProperties => {
    const b: CSSProperties = {
      padding: "13px 4px",
      borderRadius: 10,
      border: "1.5px solid",
      fontSize: 14.5,
      fontWeight: 600,
      textAlign: "center",
      cursor: sel ? "default" : "pointer",
      transition: "all .12s",
    };
    return sel
      ? { ...b, flex: 1, background: accent, color: "#fff", borderColor: accent }
      : { ...b, width: "100%", background: "#fff", color: accent, borderColor: hexAlpha(accent, 0.35) };
  };
  const navStyle = (disabled: boolean): CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "#cfd6de" : "#46505c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  // ---- calendar cells -----------------------------------------------------
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1).getDay();
    const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: { key: string; label: string; node: React.ReactNode }[] = [];
    for (let i = 0; i < first; i++) out.push({ key: `e${i}`, label: "", node: null });
    for (let d = 1; d <= dim; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const avail = isDayAvailable(date);
      const sel =
        selDate &&
        selDate.getFullYear() === viewYear &&
        selDate.getMonth() === viewMonth &&
        selDate.getDate() === d;
      const state: "available" | "selected" | "disabled" = sel
        ? "selected"
        : avail
          ? "available"
          : "disabled";
      out.push({
        key: `d${d}`,
        label: String(d),
        node: (
          <button
            type="button"
            disabled={!avail}
            onClick={avail ? () => pickDate(date) : undefined}
            style={cellStyle(state)}
          >
            {d}
          </button>
        ),
      });
    }
    while (out.length % 7 !== 0) out.push({ key: `t${out.length}`, label: "", node: null });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, selDate, accent, tint]);

  const showBack = step === "details";
  const showSummary = step === "details" || step === "done";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        padding: isMobile ? "14px 10px" : "40px 24px",
        background: "#eef1f5",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1060,
          minHeight: isMobile ? "auto" : 660,
          background: "#fff",
          border: "1px solid #e7ebf0",
          borderRadius: 16,
          boxShadow: "0 1px 2px rgba(20,40,80,.04), 0 22px 60px rgba(20,40,80,.12)",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          overflow: "hidden",
        }}
      >
        {/* ===================== LEFT RAIL ===================== */}
        <div
          style={{
            width: isMobile ? "100%" : 336,
            flex: "none",
            borderRight: isMobile ? "none" : "1px solid #eef1f4",
            borderBottom: isMobile ? "1px solid #eef1f4" : "none",
            padding: isMobile ? "22px 22px 20px" : "30px 30px 26px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {showBack && (
            <button
              type="button"
              onClick={() => setStep("select")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "1px solid #e2e7ec",
                background: "#fff",
                cursor: "pointer",
                color: "#5a6573",
                marginBottom: 18,
              }}
            >
              <ChevronLeft />
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#2563eb,#1a45c0)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 600,
                flex: "none",
              }}
            >
              {config.hostInitials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#7a8794", fontWeight: 500 }}>{config.hostName}</div>
              <div style={{ fontSize: 12, color: "#9aa3ad", fontStyle: "italic" }}>
                &ldquo;{config.hostTagline}&rdquo;
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13 }}>
            <Video style={{ flex: "none" }} />
            <span style={{ fontSize: 12.5, color: "#5a6573" }}>
              Google Meet &mdash; link sent on confirmation
            </span>
          </div>

          <h1
            style={{
              fontSize: 25,
              fontWeight: 700,
              color: "#15233a",
              letterSpacing: "-0.02em",
              margin: "18px 0 0",
              lineHeight: 1.2,
            }}
          >
            {meetingTitle}
          </h1>

          {step === "select" && isReschedule && (
            <div style={{ fontSize: 13.5, color: "#7a8794", marginTop: 16, lineHeight: 1.5 }}>
              Rescheduling — pick a new time on the right. Your details stay the same.
            </div>
          )}

          {step === "select" && !isReschedule && (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "#9aa3ad",
                  margin: "24px 0 10px",
                }}
              >
                Meeting length
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DURATIONS.map((o) => {
                  const sel = o.k === duration;
                  return (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => pickDur(o.k)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        width: "100%",
                        padding: "11px 13px",
                        borderRadius: 10,
                        border: `1.5px solid ${sel ? o.color : "#e4e8ed"}`,
                        background: sel ? o.tint : "#fff",
                        cursor: "pointer",
                        color: "#15233a",
                        transition: "all .13s",
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          border: `2px solid ${o.color}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "none",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: sel ? o.color : "transparent",
                          }}
                        />
                      </span>
                      <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 600 }}>
                        {o.title}
                      </span>
                      <span style={{ fontSize: 12.5, color: "#8a96a3", fontWeight: 500 }}>{o.blurb}</span>
                    </button>
                  );
                })}
              </div>
              {duration === "custom" && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 9 }}>
                  <input
                    value={customMins}
                    onChange={(e) => {
                      setCustomMins(e.target.value.replace(/[^0-9]/g, ""));
                      setSelTime(null);
                    }}
                    placeholder="45"
                    inputMode="numeric"
                    style={{
                      width: 72,
                      border: "1.5px solid #d4dae1",
                      borderRadius: 8,
                      fontSize: 14.5,
                      textAlign: "center",
                      color: "#15233a",
                      padding: "9px 8px",
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#7a8794" }}>minutes</span>
                </div>
              )}
            </>
          )}

          {showSummary && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <Clock style={{ flex: "none", marginTop: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#46505c" }}>{durMins} min</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <CalendarIcon style={{ flex: "none", marginTop: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#46505c", lineHeight: 1.45 }}>
                  {summaryWhen}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <Globe size={19} stroke="#7a8794" width={2} style={{ flex: "none", marginTop: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#46505c", lineHeight: 1.45 }}>
                  {tzLabel}
                </span>
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />
          {demo && (
            <div style={{ fontSize: 11, color: "#b3bcc6", marginTop: 12, lineHeight: 1.5 }}>
              Demo mode — availability is simulated and no real event is created. Add Google
              credentials to go live.
            </div>
          )}
        </div>

        {/* ===================== RIGHT PANEL ===================== */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: isMobile ? "22px 20px 26px" : "30px 32px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {step === "select" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 21, fontWeight: 700, color: "#15233a", letterSpacing: "-0.01em" }}>
                  {isReschedule ? "Pick a new time" : "Select a Date & Time"}
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setTzOpen((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#f4f6f9",
                      border: `1px solid ${tzOpen ? "#c5ced9" : "#e4e8ed"}`,
                      borderRadius: 10,
                      padding: "9px 12px",
                      cursor: "pointer",
                      transition: "border-color .12s",
                    }}
                  >
                    <Globe />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#15233a", whiteSpace: "nowrap" }}>
                      {tzLabel}
                    </span>
                    <ChevronDown
                      style={{
                        transition: "transform .15s",
                        transform: tzOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {tzOpen && (
                    <>
                      <div onClick={() => setTzOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div
                        style={{
                          position: "absolute",
                          top: 46,
                          right: 0,
                          width: 272,
                          maxHeight: 296,
                          overflowY: "auto",
                          background: "#fff",
                          border: "1px solid #e4e8ed",
                          borderRadius: 12,
                          boxShadow: "0 14px 38px rgba(20,40,80,.18)",
                          zIndex: 50,
                          padding: 6,
                        }}
                        className="scroll-col"
                      >
                        <div style={{ fontSize: 11, color: "#9aa3ad", padding: "6px 11px", letterSpacing: ".02em" }}>
                          Now {fmtTime(Date.now(), tz)}
                        </div>
                        {tzOptions.map((o) => {
                          const sel = o.tz === tz;
                          return (
                            <button
                              key={o.tz}
                              type="button"
                              onClick={() => {
                                setTz(o.tz);
                                setTzOpen(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                width: "100%",
                                textAlign: "left",
                                padding: "9px 11px",
                                border: "none",
                                borderRadius: 8,
                                background: sel ? "#f1f4fa" : "transparent",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: sel ? 600 : 500,
                                color: "#15233a",
                              }}
                            >
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {o.label}
                              </span>
                              {sel && <Check style={{ flex: "none" }} />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  gap: isMobile ? 22 : 30,
                  flex: isMobile ? "none" : 1,
                  minHeight: 0,
                }}
              >
                {/* calendar */}
                <div style={{ width: isMobile ? "100%" : 352, flex: "none", maxWidth: 360 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#15233a" }}>{monthLabel}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        onClick={prevMonth}
                        disabled={prevDisabled}
                        style={navStyle(prevDisabled)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button type="button" onClick={nextMonth} style={navStyle(false)}>
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7,1fr)",
                      gap: 2,
                      marginBottom: 6,
                    }}
                  >
                    {DOW.map((w) => (
                      <div
                        key={w}
                        style={{
                          textAlign: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: ".04em",
                          color: "#9aa3ad",
                          padding: "6px 0",
                        }}
                      >
                        {w}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                    {cells.map((c) => (
                      <div
                        key={c.key}
                        style={{
                          aspectRatio: "1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {c.node}
                      </div>
                    ))}
                  </div>
                </div>

                {/* times */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  {selDate ? (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#15233a", marginBottom: 4 }}>
                        {fmtDateFull(selDate)}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#9aa3ad", marginBottom: 14 }}>
                        {loadingSlots
                          ? "Checking availability…"
                          : slotsError
                            ? "Couldn’t load times — try again"
                            : slots.length
                              ? `${slots.length} open time${slots.length === 1 ? "" : "s"}`
                              : "No open times — try another day"}
                      </div>
                      <div
                        className="scroll-col"
                        style={{
                          flex: isMobile ? "none" : 1,
                          minHeight: 0,
                          maxHeight: isMobile ? 360 : undefined,
                          overflowY: "auto",
                          paddingRight: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 9,
                        }}
                      >
                        {slots.map((inst) => {
                          const sel = !!(selTime && selTime.inst === inst);
                          return (
                            <div key={inst} style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => setSelTime({ inst })}
                                style={slotStyle(sel)}
                              >
                                {fmtTime(inst, tz)}
                              </button>
                              {sel && (
                                <button
                                  type="button"
                                  onClick={isReschedule ? doReschedule : () => setStep("details")}
                                  disabled={booking}
                                  style={{
                                    flex: 1.4,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: "#fff",
                                    background: accent,
                                    border: "none",
                                    borderRadius: 10,
                                    cursor: booking ? "default" : "pointer",
                                    transition: "background .12s",
                                    opacity: booking ? 0.7 : 1,
                                  }}
                                >
                                  {isReschedule ? (booking ? "Saving…" : "Confirm") : "Next"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        minHeight: isMobile ? 120 : undefined,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: "#aab3bd",
                      }}
                    >
                      <CalendarIcon size={40} stroke="#cdd5dd" width={1.6} />
                      <div style={{ fontSize: 13.5, marginTop: 12, maxWidth: 170, lineHeight: 1.5 }}>
                        Pick a day to see open times
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === "details" && (
            <>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 700,
                  color: "#15233a",
                  letterSpacing: "-0.01em",
                  marginBottom: 22,
                }}
              >
                Enter Details
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 440 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#46505c" }}>
                    Name <span style={{ color: "#d04646" }}>*</span>
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sam Rivera"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#46505c" }}>
                    Email <span style={{ color: "#d04646" }}>*</span>
                  </span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sam@company.com"
                    inputMode="email"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#46505c" }}>
                    Please share anything that will help prepare for our meeting
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What would you like to cover?"
                    style={{ ...inputStyle, lineHeight: 1.5 }}
                  />
                </label>
                <div style={{ fontSize: 12, color: "#9aa3ad", lineHeight: 1.5 }}>
                  By proceeding, you confirm a calendar invite with a Google Meet link will be sent to
                  your email.
                </div>
                {bookError && (
                  <div style={{ fontSize: 13, color: "#d04646", fontWeight: 500 }}>{bookError}</div>
                )}
                <button
                  type="button"
                  onClick={schedule}
                  disabled={!canSchedule || booking}
                  style={{
                    marginTop: 4,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#fff",
                    background: canSchedule && !booking ? "#1a45c0" : "#aab8e0",
                    border: "none",
                    borderRadius: 10,
                    padding: 13,
                    cursor: canSchedule && !booking ? "pointer" : "not-allowed",
                    transition: "background .15s",
                  }}
                >
                  {booking ? "Scheduling…" : "Schedule Event"}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                maxWidth: 460,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  background: "#eafaf0",
                  border: "1px solid #c9efd8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Check size={30} stroke="#22a35c" width={2.6} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#15233a", letterSpacing: "-0.01em" }}>
                {rescheduled ? "You’re rescheduled" : "You are scheduled"}
              </div>
              <div style={{ fontSize: 14, color: "#5a6573", margin: "9px 0 24px" }}>
                {rescheduled ? (
                  <>An updated invitation has been sent to everyone on the meeting.</>
                ) : (
                  <>
                    A calendar invitation has been sent to{" "}
                    <strong style={{ color: "#15233a", fontWeight: 600 }}>{email}</strong>.
                  </>
                )}
              </div>
              <div
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid #e6eaef",
                  borderRadius: 13,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "15px 18px",
                    borderBottom: "1px solid #eef1f4",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#15233a",
                  }}
                >
                  {meetingTitle}
                </div>
                <div style={recapRow}>
                  <CalendarIcon size={18} />
                  <span style={recapText}>{summaryWhen}</span>
                </div>
                <div style={recapRow}>
                  <Globe size={18} stroke="#7a8794" width={2} />
                  <span style={recapText}>{tzLabel}</span>
                </div>
                <div style={{ ...recapRow, borderBottom: "none" }}>
                  <Video size={18} />
                  {meetingUrl && !demo ? (
                    <a href={meetingUrl} target="_blank" rel="noreferrer" style={{ ...recapText, color: "#1a45c0" }}>
                      Google Meet
                    </a>
                  ) : (
                    <span style={recapText}>Google Meet</span>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 22,
                }}
              >
                <div style={{ display: "flex", gap: 11 }}>
                  <a
                    href={googleCalendarUrl()}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#fff",
                      background: "#1a45c0",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px 22px",
                      cursor: "pointer",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    Add to calendar
                  </a>
                  {!isReschedule && (
                    <button
                      type="button"
                      onClick={reset}
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#5a6573",
                        background: "#fff",
                        border: "1px solid #d4dae1",
                        borderRadius: 10,
                        padding: "12px 20px",
                        cursor: "pointer",
                      }}
                    >
                      Schedule another
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={downloadIcs}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: "#9aa3ad",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Use Outlook or Apple Calendar? Download .ics
                </button>
                {!isReschedule && rescheduleUrl && cancelUrl && (
                  <div style={{ fontSize: 12.5, color: "#9aa3ad", marginTop: 2 }}>
                    Need to change it?{" "}
                    <a href={rescheduleUrl} style={{ color: "#5a6573", textDecoration: "underline" }}>
                      Reschedule
                    </a>
                    {" · "}
                    <a href={cancelUrl} style={{ color: "#5a6573", textDecoration: "underline" }}>
                      Cancel
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1.5px solid #d4dae1",
  borderRadius: 9,
  fontSize: 14.5,
  color: "#15233a",
  padding: "12px 13px",
};

const recapRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "13px 18px",
  borderBottom: "1px solid #f0f2f5",
};

const recapText: CSSProperties = {
  fontSize: 14,
  color: "#46505c",
  fontWeight: 500,
};
