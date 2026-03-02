# ThreadFlow

A Threads social media management app built with React, Express, and PostgreSQL.

## Overview

ThreadFlow helps you manage your Threads presence with scheduling, bulk posting, follow-up replies, and comment management — all from one dashboard.

## Features

- **Dashboard** — Account overview, stats (scheduled posts, bulk queues, follow-ups), and quick actions
- **Compose & Schedule** — Rich text compose (500 char limit), post now or schedule for a specific time, scheduled queue management
- **Bulk Post** — Create multiple posts in sequence with configurable delays (5min to 4hrs)
- **Follow-Up Thread** — Schedule timed replies to your own posts (30min, 1hr, 2hr, custom)
- **Comment Manager** — View, reply to, and like comments on any post by ID
- **Dark/Light mode** — Toggle with persistent localStorage preference
- **Background scheduler** — Checks every minute for due scheduled posts, bulk queue items, and follow-ups

## Tech Stack

- **Frontend**: React + TypeScript + Vite, TailwindCSS, shadcn/ui, TanStack Query, Wouter
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Scheduler**: Node.js setInterval (checks every 60s)

## Database Tables

- `scheduled_posts` — Single posts scheduled for future publishing
- `bulk_queues` — Named sequences of posts with delay settings
- `bulk_queue_items` — Individual posts within a bulk queue (with scheduled timestamps)
- `follow_up_threads` — Timed reply threads linked to original posts

## API Routes

- `GET /api/status` — Check if Threads token is configured
- `GET /api/profile` — Fetch connected Threads profile
- `GET /api/posts/recent` — Get recent posts from Threads API
- `POST /api/posts/publish` — Publish immediately to Threads
- `POST /api/posts/schedule` — Store a scheduled post in DB
- `GET /api/posts/scheduled` — List all scheduled posts
- `PATCH /api/posts/scheduled/:id` — Update a scheduled post
- `DELETE /api/posts/scheduled/:id` — Cancel a scheduled post
- `GET /api/bulk-queues` — List all bulk queues with items
- `POST /api/bulk-queues` — Create and start a bulk queue
- `DELETE /api/bulk-queues/:id` — Delete a bulk queue
- `GET /api/follow-ups` — List all follow-up threads
- `POST /api/follow-ups` — Schedule a follow-up reply
- `DELETE /api/follow-ups/:id` — Cancel a follow-up
- `GET /api/comments?postId=` — Get comments for a post
- `POST /api/comments/:postId/reply` — Reply to a comment
- `POST /api/comments/:mediaId/like` — Like a comment

## Environment Variables

- `THREADS_ACCESS_TOKEN` — Long-lived Threads API token (required for live Threads API features)
- `DATABASE_URL` — PostgreSQL connection string (auto-configured by Replit)
- `SESSION_SECRET` — Express session secret

## Threads API Notes

The app uses a 2-step publish process:
1. `POST /{userId}/threads` — Create a media container
2. `POST /{userId}/threads_publish` — Publish the container

Without `THREADS_ACCESS_TOKEN`, all scheduling/queue features still work (posts are stored and queued), but actual publishing will fail gracefully until the token is added.

## Architecture Notes

- The sidebar uses the Shadcn `Sidebar` component
- Theme (dark/light) uses a custom `ThemeProvider` with `localStorage` persistence
- The background scheduler uses `setInterval` at 60-second intervals
- All API errors return user-friendly messages; NO_TOKEN errors are handled specially
