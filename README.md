# OpenSlot

**A free, open-source, self-hostable scheduling page — your own Calendly.**

OpenSlot is a single, beautiful booking page you run yourself and connect to *your*
Google Calendar and *your* domain. Visitors pick a meeting length, a day, and a time
(shown in their own time zone), enter their details, and get a real calendar invite with
an auto-generated Google Meet link. No accounts, no per-seat fees, no third party in the
middle — you own the code and the data.

The signature touch: **each meeting length has its own color**, and that accent flows
through the entire calendar — available days, the selected day, the time slots, and the
buttons all recolor to match.

> Built with Next.js (App Router) + TypeScript. The UI is a faithful build of the hi-fi
> design reference in [`design_handoff_scheduler/`](./design_handoff_scheduler/).

---

## Why OpenSlot?

- **Self-hosted & private** — runs on your own infrastructure; meeting data never leaves
  your Google account and your server.
- **Free forever** — MIT licensed, no SaaS subscription.
- **Yours to brand** — your name, your tagline, your domain, your working hours.
- **Real calendar sync** — server-side Google free/busy + event creation with a Meet
  link and an emailed invite. OAuth secrets stay on the server, never in the browser.
- **Conflict-aware across all your calendars** — check free/busy across as many calendars
  as you like (work, health, side projects), so a meeting on *any* of them automatically
  removes that slot and you never get double-booked. See
  [Blocking across multiple calendars](#blocking-across-multiple-calendars).
- **Works out of the box** — runs in **demo mode** with simulated availability before you
  connect anything, so you can try it in under a minute.
- **Extensible** — a provider-agnostic backend; an Outlook/Microsoft 365 (Teams) provider
  can be added without touching the UI.

---

## Quick start

Requires **Node 18.18+** (Node 20+ recommended).

```bash
git clone https://github.com/<your-username>/OpenSlot.git
cd OpenSlot
npm install

# copy the env template (macOS/Linux)
cp .env.example .env.local
# …or on Windows PowerShell:
# copy .env.example .env.local

npm run dev
```

Open <http://localhost:3000>. With no credentials set it runs in **demo mode** — fully
clickable, availability simulated, bookings faked. When you're ready for real bookings,
follow [Connect your Google Calendar](#connect-your-google-calendar).

---

## Make it yours

All configuration is environment variables in `.env.local` (copied from
[`.env.example`](./.env.example)). `NEXT_PUBLIC_*` values are branding shown in the
browser; the rest are server-side.

### Your identity / branding

| Variable | What it controls | Example |
| --- | --- | --- |
| `NEXT_PUBLIC_HOST_NAME` | Name shown on the page and in invites | `Jane Doe` |
| `NEXT_PUBLIC_HOST_INITIALS` | Monogram in the avatar circle | `JD` |
| `NEXT_PUBLIC_HOST_TAGLINE` | Italic tagline under your name | `Let's talk.` |

> The `.ics` download filename and event titles are derived from `NEXT_PUBLIC_HOST_NAME`
> automatically (e.g. `meeting-with-jane-doe.ics`), so there's nothing else to rename.

### Your availability

| Variable | What it controls | Default |
| --- | --- | --- |
| `HOST_TIMEZONE` | IANA zone your working hours are defined in | `America/Los_Angeles` |
| `WORK_START_HOUR` / `WORK_END_HOUR` | Bookable window, 24h clock | `9` / `17` |
| `NEXT_PUBLIC_ALLOW_WEEKENDS` | Allow Saturday/Sunday bookings | `false` |
| `HOST_CALENDAR_ID` | Calendar new bookings are created on | `primary` |
| `HOST_BUSY_CALENDAR_IDS` | Extra calendars to check for conflicts (see below) | _(none)_ |

#### Blocking across multiple calendars

By default OpenSlot only checks `HOST_CALENDAR_ID` for conflicts. To stop
double-bookings against your *other* calendars (work, health, a side project),
add their calendar IDs — comma-separated — to `HOST_BUSY_CALENDAR_IDS`. A busy
block on **any** listed calendar (the booking calendar is always included)
removes that slot.

Each calendar must be **visible to the connected Google account** — share it
into that account with at least *See free/busy* access, the same way you'd
overlay calendars in Google Calendar. Find a calendar's ID in **Google Calendar
→ that calendar's Settings → "Integrate calendar" → Calendar ID** (looks like an
email or `…@group.calendar.google.com`). Example:

```ini
HOST_BUSY_CALENDAR_IDS="work@yourcompany.com,abc123@group.calendar.google.com"
```

A calendar the account can't read is logged and skipped, never failing the
whole availability lookup.

**Finding your calendar IDs the easy way:** once Google is connected, visit
`/api/setup/calendars?key=YOUR_GOOGLE_CLIENT_SECRET` — it lists every calendar
the connected account can see, with each `id`, so you can copy the right values
into `HOST_CALENDAR_ID` / `HOST_BUSY_CALENDAR_IDS`. It's gated behind your client
secret, so the list isn't public.

### The meeting lengths & colors

The four lengths and their accent/tint colors live in
[`src/lib/durations.ts`](./src/lib/durations.ts). Edit that one array to change the
durations, labels, blurbs, or palette — the whole calendar re-themes automatically.

---

## Connect your Google Calendar

OpenSlot is a **single-host** scheduler: it authenticates as *you* with a stored refresh
token, so your visitors never sign in. One-time setup (~5 minutes):

1. **[Google Cloud Console](https://console.cloud.google.com/)** → create (or pick) a
   project → **enable the Google Calendar API**.
2. **APIs & Services → OAuth consent screen** → configure it (User type *External* is
   fine) and add your own Google account under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Under
   **Authorized redirect URIs** add exactly:
   `http://localhost:3000/api/auth/google/callback`
4. Copy the **Client ID** and **Client secret** into `.env.local`:
   ```ini
   GOOGLE_CLIENT_ID="…"
   GOOGLE_CLIENT_SECRET="…"
   ```
5. Run `npm run dev`, then visit **<http://localhost:3000/api/auth/google>** and approve
   the consent screen.
6. The callback page prints a `GOOGLE_REFRESH_TOKEN="…"` line. Paste it into `.env.local`
   and **restart** the server.

Done — OpenSlot now reads your real free/busy and creates real events with Meet links and
emailed invites.

> **Security:** the refresh token grants access to your calendar. It lives only in
> `.env.local` (which is git-ignored) and is shown once during setup; the app never
> stores it anywhere else. Never commit it.

---

## Deploy to your own domain

OpenSlot is a standard Next.js app and runs on any Node host (Vercel, Netlify, Fly.io,
Render, a VPS, etc.). Using **Vercel** as the example:

1. Push your fork to GitHub and **import the repo** in Vercel.
2. In the project's **Environment Variables**, add everything from your `.env.local`
   (host branding, working hours, and the Google credentials).
3. Set `GOOGLE_REDIRECT_URI` to your production callback, e.g.
   `https://book.yourdomain.com/api/auth/google/callback`, and add that **same URL** to
   the Authorized redirect URIs on your Google OAuth client.
4. Add your custom domain in Vercel (e.g. `book.yourdomain.com`) and point your DNS at it.
5. Re-run the connect flow once against the production URL
   (`https://book.yourdomain.com/api/auth/google`) to mint a refresh token for that
   origin, and set it as the `GOOGLE_REFRESH_TOKEN` env var.

Then share `https://book.yourdomain.com` — that's your personal scheduling page.

> Going beyond yourself as a test user? Move the OAuth consent screen out of "Testing" and
> submit it for verification per Google's requirements.

---

## How it works

```
Browser (Scheduler.tsx)
  │  GET  /api/availability?date&durationMin   → open instants (ms epoch)
  │  POST /api/book  {startInst,name,email,…}  → event + Meet link + invite
  ▼
API routes ──► getProvider() ──► GoogleProvider  (real free/busy + events.insert)
                              └─► DemoProvider    (simulated, when no creds)
```

- **Availability** — the server slices `WORK_START_HOUR…WORK_END_HOUR` in `HOST_TIMEZONE`
  into 30-minute increments, subtracts the calendar's busy ranges, and drops past slots.
- **Time zones** — slots are stored as absolute instants and formatted in the visitor's
  auto-detected zone, so a 9 am PT slot correctly reads as 12 pm ET / 5 pm London. The
  math ([`src/lib/timezone.ts`](./src/lib/timezone.ts)) is dependency-free `Intl` and runs
  identically on server and client.
- **Booking** — re-validated server-side before the event is created; visitors never talk
  to Google directly.

### Project layout

```
src/
  app/
    layout.tsx, page.tsx, globals.css
    api/
      availability/route.ts          GET  open slots
      book/route.ts                  POST create event
      auth/google/route.ts           one-time OAuth connect
      auth/google/callback/route.ts  → prints your refresh token
  components/
    Scheduler.tsx                    the whole UI (3 steps)
    icons.tsx
  lib/
    config.ts        env-backed settings
    durations.ts     the meeting lengths + colors
    timezone.ts      instant ↔ wall-clock helpers
    tzOptions.ts     time-zone dropdown list
    ics.ts           .ics fallback download
    calendar/
      provider.ts    the CalendarProvider interface
      slots.ts       working-hours → open instants
      google.ts      GoogleProvider (real)
      demo.ts        DemoProvider (simulated)
      index.ts       getProvider() / isDemoMode()
```

---

## Extending: add Microsoft / Outlook

Implement the same `CalendarProvider` interface
([`src/lib/calendar/provider.ts`](./src/lib/calendar/provider.ts)) against Microsoft Graph
(`getSchedule` for free/busy, `me/events` with `isOnlineMeeting: true` for a Teams link),
then return it from `getProvider()`. The front-end and API routes need no changes — the
confirmation screen reads the returned `meetingUrl` regardless of provider.

---

## Contributing

Issues and pull requests are welcome. This is a small, dependency-light codebase by
design — keep changes focused and the UI faithful to the design tokens in
[`design_handoff_scheduler/README.md`](./design_handoff_scheduler/README.md).

## License

[MIT](./LICENSE) — free and open source. Use it, fork it, brand it, host it.
