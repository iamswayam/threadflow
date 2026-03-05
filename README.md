# ThreadFlow

ThreadFlow is a full-stack Threads management app (React + Express + PostgreSQL) for publishing, scheduling, analytics, reply handling, and AI-assisted drafting.

## Agent Handoff (Current Behavior)

This section is the fastest way for the next agent to understand the current product state.

### 1) Plan and Pro gating

- Source of truth in UI right now: sidebar dev toggle (`client/src/components/app-sidebar.tsx`).
- Toggle persists in `localStorage` key: `threadflow_dev_pro`.
- Toggle also calls `PATCH /api/admin/set-plan` for the current user.
- Dashboard Quick Action `Thread Chain` is Pro-gated:
  - Pro ON: opens `/chain`.
  - Pro OFF: shows friendly "Feature available in Pro" toast.
- My Content tag filtering is Pro-gated:
  - `All Posts` is always free.
  - Divider row shown: `---- crown filters ----`.
  - Clicking custom tags on free shows "Tag filters are a Pro feature." toast.

### 2) AI usage limits

- Endpoint: `GET /api/ai/usage` returns current usage state.
- Free plan: 10 server-key AI requests/day.
- Pro plan: unlimited.
- If user has own provider key for a provider, that provider is unlimited for that user.
- Dashboard AI Assistant status line is always shown:
  - `Pro · Unlimited`
  - `Own key · Unlimited`
  - or `X / 10 today`
- Limit hit from `POST /api/ai/chat` returns `DAILY_LIMIT_REACHED` and UI shows inline upgrade prompt.

### 3) My Content insights and deletion

- Main endpoints:
  - `GET /api/posts/my-content`
  - `GET /api/posts/tag-insights?tag=...`
  - `POST /api/posts/refresh-insights`
  - `GET /api/posts/deleted`
  - `DELETE /api/posts/:postId` (internal DB id)
- All Posts insights behavior:
  - Uses stored insight snapshot fields.
  - Also fetches live per-post insights for visible/all-targeted posts with `threadsPostId` and merges live data for display.
- Tag view (`#tag`) uses aggregated tag insights endpoint and shows stats + best post.
- Deleted flow:
  - Delete action always moves post to Deleted section in ThreadFlow.
  - Backend attempts Threads delete if `threadsPostId` and token are available.
  - Response includes `deletedFromThreads`.
  - UI now warns if moved locally but remote Threads delete failed.

### 4) Compose scheduled edit flow

- Compose page scheduled queue has `Edit` action.
- Editing a pending scheduled post loads it into composer (content, topic, app tags, media, schedule time).
- Save uses `PATCH /api/posts/scheduled/:id`.
- Cancel edit restores normal compose state.

### 5) Performance DNA data collection

- `scheduled_posts` stores DNA and insight snapshot columns.
- DNA extraction is reused across publish paths and protected by comments in `server/routes.ts`.
- Covered publish paths:
  - `POST /api/posts/publish`
  - Scheduler pending post publish
  - Scheduler bulk item publish
  - `POST /api/thread-chain`
- Data endpoints:
  - `GET /api/posts/dna-data`
  - `POST /api/posts/refresh-insights`

### 6) Today’s updates (March 6, 2026)

- Dashboard (`client/src/pages/dashboard.tsx`)
  - Top profile area refined and aligned for premium dark theme.
  - Smart insights area was upgraded from static to rotating, then to a continuous marquee ticker.
  - Marquee now supports richer mixed-length insights from profile, analytics summary, recent posts, DNA, AI usage, and audience persona.
  - Added `/api/analytics?summaryOnly=true&postsLimit=10` and `/api/analytics/persona` client fetches with safe fallbacks.
  - Marquee behavior improvements:
    - Continuous loop with duplicated track.
    - Pause on hover.
    - Slower speed (`80s`) for readability.
    - Fisher-Yates shuffle on build so order changes each refresh.
    - Label-first render order with orange-highlighted values.
    - Adaptive spacing for long vs short items.
  - Layout updates:
    - Dashboard heading reduced to single-line title + subtitle.
    - Reordered dashboard sections/cards to match requested visual flow.
    - Quick Actions card compacted (tight vertical spacing and smaller icon/text rhythm).
    - Quick Post vertical bloat reduced using compact card styles.
    - Recent Posts typography/width balancing tuned.

- Post composer (`client/src/components/post-composer-card.tsx`)
  - Added tooltip info icons for `Topic Tag` and `APP TAG` labels.
  - Topic default-tag highlight color changed to `#0EA5E9`.
  - Added scheduled post edit mode support:
    - prefill fields from selected scheduled item,
    - update via `PATCH /api/posts/scheduled/:id`,
    - reset/cancel flows after save.

- Compose page (`client/src/pages/compose.tsx`)
  - Added edit action in pending scheduled list.
  - Wired selected scheduled item into shared composer for in-place edits.
  - Improved scheduled item card state styling while editing.

- My Content (`client/src/pages/MyContent.tsx`)
  - Added Pro gating for tag filters with clear toast feedback.
  - Added visual divider/crown marker for Pro filter section.
  - Added live-insight merge for all-posts view (stored snapshot + fresh per-post insights).
  - Improved delete feedback when local delete succeeds but Threads remote delete fails.
  - Added automatic refresh-insights trigger with safe invalidation.

- Analytics page (`client/src/pages/Analytics.tsx`)
  - Added Pro-gated access and empty-state gate UI.
  - Query enable conditions now enforce token + Pro mode.
  - Synced dashboard/sidebar Pro toggle behavior.

- Auth context (`client/src/lib/auth-context.tsx`)
  - Added `plan` on `AuthUser` for client-side Pro checks.

- Server routes (`server/routes.ts`)
  - Added plan guard helper and enforced Pro plan on:
    - `GET /api/analytics`
    - `GET /api/analytics/persona`
  - Updated AI provider catalog model lists/defaults:
    - OpenAI: `gpt-4o`, `gpt-4o-mini` (default `gpt-4o`)
    - Anthropic: `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` (default `claude-sonnet-4-5`)
    - Gemini default switched to `gemini-2.0-flash`
  - Hardened acceptable delete error matching for Threads deletes.

- Threads API helper (`server/threads.ts`)
  - Updated delete endpoint call to include encoded post id and access token query parameter for better compatibility.

---

## Core Features

- Auth: signup/signin with JWT.
- Threads connect:
  - Manual credentials (`/api/auth/connect-threads`).
  - OAuth redirect flow (`/api/auth/threads/connect`, `/api/auth/threads/callback`).
- Publish now, schedule, bulk queue, follow-up, thread chain.
- Recent posts with engagement, repost, quote.
- Analytics and audience persona.
- Reply center and comments actions.
- My Content with app tags, per-tag insights, deleted bin.
- AI assistant with per-day plan limits.

---

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, Wouter.
- Backend: Express + TypeScript.
- DB: PostgreSQL + Drizzle ORM.
- Auth: JWT + bcrypt.
- Scheduler: background interval worker in `server/routes.ts`.

---

## Setup

```bash
git clone https://github.com/iamswayam/threadflow.git
cd threadflow
npm install
```

Create `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/threadflow
SESSION_SECRET=change-me
JWT_SECRET=optional_fallbacks_to_SESSION_SECRET

# Threads OAuth
THREADS_APP_ID=your_meta_app_id
THREADS_APP_SECRET=your_meta_app_secret
THREADS_REDIRECT_URI=http://localhost:5000/api/auth/threads/callback

# Server-side AI keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_AI_API_KEY=your_google_ai_key
# Optional aliases used by provider resolver in code
# GEMINI_API_KEY=...
# PERPLEXITY_API_KEY=...

# Admin
ADMIN_EMAIL=your@email.com
```

Apply schema and start:

```bash
npm run db:push
npm run dev
```

Typecheck:

```bash
npm run check
```

---

## Important Notes

- OAuth callback must be reachable at `THREADS_REDIRECT_URI`.
- In Meta Dev mode, only tester accounts can complete OAuth/use app features.
- Threads insights can lag; app now mixes stored + live insights in some views.
- Deleted posts are excluded from normal list/tag/DNA queries.
- Deleting in My Content is local-first with best-effort remote Threads delete.
- Current Pro toggle is dev-mode behavior (sidebar), not Stripe billing yet.

---

## API Reference (Current)

All endpoints below require `Authorization: Bearer <jwt>` unless noted.

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `GET /api/auth/me`
- `POST /api/auth/connect-threads`
- `POST /api/auth/disconnect-threads`
- `GET /api/auth/threads/connect`
- `GET /api/auth/threads/callback` (no auth; browser redirect)
- `PATCH /api/auth/default-topic`
- `PATCH /api/auth/password`
- `DELETE /api/auth/account`

### AI and plans

- `GET /api/ai/providers`
- `GET /api/ai/usage`
- `GET /api/ai/keys`
- `PATCH /api/ai/keys`
- `POST /api/ai/chat`
- `PATCH /api/admin/set-plan`

### Posts and insights

- `GET /api/posts/recent`
- `POST /api/posts/publish`
- `POST /api/posts/:postId/repost`
- `POST /api/posts/:postId/quote`
- `GET /api/posts/:postId/insights`
- `POST /api/posts/schedule`
- `GET /api/posts/scheduled`
- `PATCH /api/posts/scheduled/:id`
- `DELETE /api/posts/scheduled/:id`
- `GET /api/posts/tags`
- `GET /api/posts/my-content`
- `GET /api/posts/tag-insights`
- `POST /api/posts/refresh-insights`
- `GET /api/posts/dna-data`
- `DELETE /api/posts/:postId`
- `GET /api/posts/deleted`

### Analytics and community

- `GET /api/analytics`
- `GET /api/analytics/persona`
- `GET /api/reply-center`
- `POST /api/reply-center/:replyId/hide`
- `POST /api/reply-center/:replyId/reply`
- `GET /api/comments`
- `POST /api/comments/:postId/reply`
- `POST /api/comments/:mediaId/like`

### Queues and chains

- `GET /api/bulk-queues`
- `POST /api/bulk-queues`
- `PATCH /api/bulk-queues/:id`
- `DELETE /api/bulk-queues/:id`
- `GET /api/follow-ups`
- `POST /api/follow-ups`
- `DELETE /api/follow-ups/:id`
- `POST /api/thread-chain`

---

## Project Structure

```text
client/
  src/
    components/
    pages/
    lib/
server/
  auth.ts
  routes.ts
  storage.ts
  threads.ts
shared/
  schema.ts
README.md
```

---

## License

MIT
