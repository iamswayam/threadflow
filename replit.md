# ThreadFlow

A full-stack Threads (Meta) social media management app with multi-user auth, scheduling, bulk posting, follow-up replies, and comment management.

## Overview

ThreadFlow lets each user manage their Threads presence with their own account and personal Threads API credentials — all from one dashboard.

## Features

### Auth System
- **Signup / Signin** — Email + password (bcrypt hashed), JWT sessions stored in localStorage
- **Per-user Threads credentials** — Each user stores their own access token, app ID, and app secret
- **Connect Threads modal** — Verifies credentials against the Threads API on save
- **Protected routes** — All API routes require a valid JWT Bearer token
- **Settings page** — Update credentials, change password, delete account, app info

### Posting
- **Dashboard Quick Post** — Post directly to Threads from the dashboard
- **Compose & Schedule** — Rich text compose (500 char limit), post now or schedule for a specific time
- **Bulk Post** — Multiple posts in sequence with configurable delays + drag-and-drop reordering, Pause/Cancel controls
- **Follow-Up Thread** — Timed replies with a live countdown timer on pending follow-ups
- **Comment Manager** — View, reply to, like comments; keyword/username filter; new comments highlighted

### UI/UX
- **Dark/Light mode** — Toggle in header, dark default with near-black background
- **Sidebar gradient** — Dark navy to dark teal gradient background
- **Active glow effect** — Active sidebar items have a subtle teal glow
- **Page transitions** — Framer-motion fade/slide animations between pages
- **Notification bell** — In header with popover panel
- **User avatar** — Initials shown in header and sidebar footer
- **Connection status** — Green/red dot in sidebar showing Threads connection state
- **Mobile sidebar** — Hamburger trigger collapses the sidebar on small screens
- **ThreadFlow logo** — Custom SVG @ symbol in teal/cyan gradient

### Background Scheduler
- Checks every 60 seconds for due scheduled posts, bulk queue items, and follow-ups
- Uses each user's own Threads access token from the database

## Tech Stack

- **Frontend**: React + TypeScript + Vite, TailwindCSS, shadcn/ui, TanStack Query, Wouter, Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: bcrypt + jsonwebtoken (JWT, 30-day expiry)
- **Scheduler**: Node.js setInterval (60s)

## Database Tables

- `users` — Email, bcrypt-hashed password, Threads credentials (access token, app ID, app secret, username, profile pic)
- `scheduled_posts` — Single posts scheduled for future publishing (FK: userId)
- `bulk_queues` — Named sequences of posts with delay settings (FK: userId)
- `bulk_queue_items` — Individual posts within a bulk queue
- `follow_up_threads` — Timed reply threads linked to original posts (FK: userId)

## API Routes

### Auth
- `POST /api/auth/signup` — Create account (email + password)
- `POST /api/auth/signin` — Login, returns JWT token
- `GET /api/auth/me` — Get current user (requires auth)
- `POST /api/auth/connect-threads` — Save & verify Threads credentials (requires auth)
- `POST /api/auth/disconnect-threads` — Remove Threads credentials (requires auth)
- `PATCH /api/auth/password` — Change password (requires auth)
- `DELETE /api/auth/account` — Delete account (requires auth)

### Posts & Content (all require auth)
- `GET /api/profile` — Fetch connected Threads profile
- `GET /api/posts/recent` — Get recent posts from Threads API
- `POST /api/posts/publish` — Publish immediately to Threads
- `POST /api/posts/schedule` — Store a scheduled post in DB
- `GET /api/posts/scheduled` — List user's scheduled posts
- `PATCH /api/posts/scheduled/:id` — Update a scheduled post
- `DELETE /api/posts/scheduled/:id` — Cancel a scheduled post
- `GET /api/bulk-queues` — List user's bulk queues with items
- `POST /api/bulk-queues` — Create and start a bulk queue
- `PATCH /api/bulk-queues/:id` — Update queue status (pause/cancel)
- `DELETE /api/bulk-queues/:id` — Delete a bulk queue
- `GET /api/follow-ups` — List user's follow-up threads
- `POST /api/follow-ups` — Schedule a follow-up reply
- `DELETE /api/follow-ups/:id` — Cancel a follow-up
- `GET /api/comments?postId=` — Get comments for a post
- `POST /api/comments/:postId/reply` — Reply to a comment
- `POST /api/comments/:mediaId/like` — Like a comment

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-configured by Replit)
- `SESSION_SECRET` — Used as JWT signing secret fallback
- `JWT_SECRET` — JWT signing secret (optional, falls back to SESSION_SECRET)

## Architecture Notes

- JWT stored in `localStorage` as key `tf_token`; all API requests include `Authorization: Bearer <token>` header
- `queryClient.ts` injects the token on every request automatically
- `server/auth.ts` handles bcrypt helpers, JWT sign/verify, and `requireAuth` middleware
- The background scheduler joins posts with users table to get per-user access tokens
- Threads API uses a 2-step publish: create container → wait 2s → publish container
