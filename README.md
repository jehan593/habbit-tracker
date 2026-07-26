# Habit Tracker

A minimal, local-first habit tracker. No build step, no framework — just HTML, CSS, and JavaScript, with optional cross-device sync.

**Live app:** https://jehan593.github.io/habbit-tracker/

## Features

- Log daily habits, marked as either **good** or **bad**
- Streak tracking, with a flame indicator once a streak takes off
- **Progress** view: a calendar heatmap plus daily trend and per-habit charts over 7/30/90-day windows
- Add, edit, and delete habits from a dedicated management screen
- Optional password lock for the whole app
- Export/import all data as a single JSON file
- Optional cross-device sync via Supabase magic-link email sign-in — no password to manage, and the same email always resolves to the same data
- Works fully offline; data is stored in `localStorage` by default

## Tech stack

- Vanilla JavaScript, HTML, and CSS — no build tooling or framework
- [Supabase](https://supabase.com) JS client, loaded from CDN, used only for the optional sync feature
- Self-hosted Martian Mono webfont

## Running it locally

This is a static site, so any local web server works:

```bash
git clone https://github.com/jehan593/habbit-tracker.git
cd habbit-tracker
npx serve .
```

Then open the printed local URL. Opening `index.html` directly from disk also works, except for the sync feature (browsers block `fetch` from `file://` origins).

## Data & sync

By default, all data lives in your browser's `localStorage` — nothing leaves your device. Turning on **Sync** from the header signs you in with a magic link and mirrors your habits and logs to Supabase (secured with Row Level Security) so they follow you across devices.

## Project structure

```
index.html   Markup and layout
style.css    Styling
app.js       App state, rendering, and sync logic
fonts/       Self-hosted Martian Mono font
```
