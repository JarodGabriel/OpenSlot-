// Demo provider — used automatically when Google credentials are absent so the
// app is fully clickable out of the box. Busy ranges are generated
// deterministically per day so availability looks realistic (and stable across
// reloads), and createEvent returns a fake Meet link without touching anything.

import type {
  CalendarProvider,
  BusyRange,
  CreateEventInput,
  CreateEventResult,
  EventInfo,
} from "./provider";

// Cheap deterministic hash so a given day always "looks" the same.
function dayHash(dayMs: number): number {
  let h = dayMs % 2147483647;
  h = (Math.imul(h, 48271) % 2147483647) >>> 0;
  return h;
}

export class DemoProvider implements CalendarProvider {
  async getBusy(fromISO: string, toISO: string): Promise<BusyRange[]> {
    const from = new Date(fromISO).getTime();
    const to = new Date(toISO).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const out: BusyRange[] = [];

    // Walk each UTC day in range and carve out a couple of pseudo-random blocks.
    for (let t = Math.floor(from / dayMs) * dayMs; t < to; t += dayMs) {
      const h = dayHash(t);
      const blocks = h % 3; // 0–2 busy blocks
      for (let i = 0; i < blocks; i++) {
        const startHourUtc = 14 + ((h >> (i * 3)) % 6); // ~late morning–afternoon
        const start = t + startHourUtc * 60 * 60 * 1000;
        const end = start + (30 + ((h >> i) % 3) * 30) * 60 * 1000; // 30–90 min
        if (start >= from && end <= to) out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
    return out;
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const id =
      input.id ||
      `demo-${Buffer.from(`${input.startISO}-${input.attendeeEmail}`).toString("base64url").slice(0, 16)}`;
    return { id, meetingUrl: "https://meet.google.com/demo-not-a-real-link" };
  }

  // Demo mode keeps no state, so reschedule/cancel just succeed as no-ops and
  // getEvent returns a plausible placeholder so the pages render.
  async getEvent(eventId: string): Promise<EventInfo | null> {
    return {
      id: eventId,
      title: "Demo Meeting",
      startISO: new Date().toISOString(),
      endISO: new Date().toISOString(),
      attendeeEmail: "guest@example.com",
      meetingUrl: "https://meet.google.com/demo-not-a-real-link",
    };
  }

  async updateEventTime(): Promise<void> {
    /* no-op in demo mode */
  }

  async cancelEvent(): Promise<void> {
    /* no-op in demo mode */
  }
}
