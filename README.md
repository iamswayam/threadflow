# ThreadFlow ðŸŒŠ

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20PostgreSQL-teal" alt="Stack" />
  <img src="https://img.shields.io/badge/Status-Active-brightgreen" alt="Status" />
  <img src="https://img.shields.io/badge/Threads-API-black" alt="Threads API" />
</p>

**ThreadFlow** is a full-stack open-source social media management app for [Meta Threads](https://www.threads.net). Schedule posts, send bulk threads in sequence, manage follow-up replies, and handle comments â€” all from one clean dashboard.

---

## Screenshots

> _Add your screenshots here_

---

## Features

- **Multi-user auth** - Signup/signin with email and password (bcrypt + JWT)
- **Per-user Threads credentials** - Each account stores its own Threads API tokens
- **Post Scheduler** - Schedule threads for a specific date and time
- **Bulk Posting** - Send multiple threads in sequence with configurable delays and drag-and-drop reordering
- **Follow-Up Threads** - Auto-schedule a timed reply to any post with a live countdown timer
- **Comment Manager** - View, reply to, and like comments on any post
- **Repost + Quote actions** - Repost quickly or open inline quote compose from recent posts
- **Thread Chain publishing** - Publish connected multi-post chains
- **Analytics dashboard** - Account totals with time-window filter (24h, 48h, 7d, 30d)
- **Post Performance controls** - Metric selector plus post count selector (10, 50, 100)
- **Post timeline labels** - Month markers shown below bars; partial carry-over months are hidden and week labels are omitted
- **Audience Persona panel** - Follower demographics by country, city, age range, and gender (requires Threads demographics eligibility)
- **Global audience map** - Full-width world map with country shading by follower count
- **Full-form demographic labels** - Country and gender labels normalized to readable names (for example, United States, India, Female, Male)
- **Follower count clarity** - Persona cards and rows explicitly show follower counts and percentages
- **Settings Page** - Update API credentials, change password, delete account
- **Mobile Responsive** - Collapsible sidebar with hamburger menu

---
## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui + TailwindCSS |
| Animations | Framer Motion |
| Data Fetching | TanStack Query v5 |
| Routing | Wouter |
| Maps | react-simple-maps (world map visualization) |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| Auth | bcrypt + JSON Web Tokens |
| Scheduler | Node.js `setInterval` (60s) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### 1. Clone the Repository

```bash
git clone https://github.com/iamswayam/threadflow.git
cd threadflow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/threadflow
SESSION_SECRET=your-secret-key-here
```

> `JWT_SECRET` is optional â€” it falls back to `SESSION_SECRET` if not set.

### 4. Push the Database Schema

```bash
npm run db:push
```

This creates all required tables automatically using Drizzle ORM.

### 5. Start the App

```bash
npm run dev
```

The app runs on **http://localhost:5000**

---

## Connecting Your Threads Account

### Step 1: Make Sure Your Instagram is a Professional Account

1. Open your **Instagram app**
2. Go to **Settings â†’ Account**
3. Tap **"Switch to Professional Account"**
4. Choose **Creator** or **Business** and complete setup

> Threads automatically follows your Instagram account type â€” once Instagram is Professional, Threads is too âœ…

---

### Step 2: Create a Meta Developer Account & App

1. Go to **[developers.facebook.com](https://developers.facebook.com)**
2. Click **"Get Started"** (top right) and log in with your **personal Facebook account**
3. Accept Meta Platform Policies and complete verification
4. Once logged in, click **"My Apps"** â†’ **"Create App"**
5. Select:
   - What do you want to build? â†’ **Other**
   - App type â†’ **None**
   - App name â†’ `ThreadFlow` (or anything you like)
   - Contact email â†’ your email
6. Click **"Create App"**

---

### Step 3: Add Threads API to Your App

1. On your app dashboard, scroll down to **"Add Products to Your App"**
2. Find **"Threads API"** â†’ click **"Set Up"**
3. Threads API will now appear in your left sidebar

---

### Step 4: Enable Required Permissions

1. Left sidebar â†’ **Threads API â†’ Use Cases**
2. Click **"Edit"** next to "Authentication and Permissions"
3. Enable these 5 permissions by clicking **"Add"** next to each:
   - âœ… `threads_basic`
   - âœ… `threads_content_publish`
   - âœ… `threads_manage_replies`
   - âœ… `threads_read_replies`
   - âœ… `threads_manage_insights`

---

### Step 5: Link Your Threads Account to a Facebook Page

> This is required by Meta to authenticate your Threads account via the API.

**Create a Facebook Page:**
1. Open Facebook â†’ tap **Menu (â˜°)** â†’ **Pages** â†’ **Create**
2. Name it anything (e.g. your brand name)
3. Category: Creator, Brand, or Personal Blog
4. Tap **Done**

**Link Instagram to Facebook Page:**
1. Open your **Instagram app** (the account you use for Threads)
2. Go to **Settings â†’ Accounts Centre**
3. Tap **"Add Facebook Account"**
4. Log in with your **personal Facebook credentials**
5. Select the **Facebook Page** you just created â†’ Confirm

> âš ï¸ Privacy Note: Your Facebook friends will NOT see this page or be notified. You can keep the page unpublished by going to Page Settings â†’ Visibility â†’ Page Unpublished. It is only used as a silent technical bridge for the API.

---

### Step 6: Add Your Threads Account as a Tester

1. In Meta Developer Portal â†’ left sidebar â†’ **App Roles â†’ Roles**
2. Click **"Add Testers"**
3. Type your **Threads/Instagram username** and submit

**Accept the invite on your phone:**
1. Open **Threads app** on your phone
2. Switch to your Threads account
3. Go to **Settings (âš™ï¸) â†’ Account â†’ Website Permissions**
4. You'll see a pending invite â†’ tap **"Accept"**

---

### Step 7: Generate Your Access Token

1. Left sidebar â†’ **Threads API â†’ Use Cases**
2. Scroll down to **"Generate Token"**
3. Your Threads account will appear â€” click **"Generate Token"** next to it
4. A popup opens â€” log in with your Threads/Instagram credentials
5. Accept all permissions â†’ click **"Allow"**
6. **Copy the long token that appears immediately** and save it safely

---

### Step 8: Get Your App ID & App Secret

1. Left sidebar â†’ **App Settings â†’ Basic**
2. Copy your **App ID** at the top
3. Click **"Show"** next to App Secret â†’ copy it

---

### Step 9: Connect in ThreadFlow

1. Sign up / Sign in to ThreadFlow
2. Click **"Connect Now"** on the dashboard banner
3. Paste your:
   - **Access Token** â† required
   - **App ID** â† required
   - **App Secret** â† required
4. Click **"Connect Account"**

Once connected you'll see:
- âœ… Your Threads profile picture and username on the dashboard
- âœ… Green **"Connected"** status dot
- âœ… All features unlocked!

---

## Important Notes

| Topic | Details |
|---|---|
| **Token expiry** | Access tokens expire in **60 days** - regenerate when expired |
| **Rate limits** | 250 posts + 1,000 replies per 24 hours |
| **App mode** | App starts in **Development mode** - only testers can use it |
| **Live mode** | To let others use it, submit for **Meta App Review** |
| **Insights permission** | `threads_manage_insights` must be enabled in your Meta app for analytics |
| **Insights freshness** | Threads insights are daily aggregated and can lag behind real-time activity |
| **Post insights scale** | `/api/analytics` returns selected posts, but detailed per-post insights are fetched for first 100 posts |
| **Persona eligibility** | `follower_demographics` requires at least 100 followers; otherwise persona panel shows an eligibility message |
| **Persona time granularity** | Audience Persona uses current/lifetime demographic snapshots (not day-by-day or month-by-month) |
| **Map rendering** | Global map uses country-level follower data from persona demographics |
| **Pinning** | Threads API does not support pinning - pin manually in the Threads app after follow-up posts |

---
## Common Errors & Fixes

| Error | Fix |
|---|---|
| `Could not load analytics` | Verify `threads_manage_insights` is enabled and granted for the token |
| `followers_count` missing/null | App uses fallback endpoints; if still null, regenerate token and re-check app permissions |
| `Invalid OAuth access token` | Token copied incorrectly - regenerate it |
| `User not authorized` | Threads account not added as tester - redo Step 6 |
| `Permission denied` | Not all permissions granted - redo Step 4 |

---
## Self-Hosting on Replit

1. Fork or import this repo into [Replit](https://replit.com)
2. Set the following Replit Secrets:
   - `DATABASE_URL` â€” your PostgreSQL connection string (Replit provides one automatically)
   - `SESSION_SECRET` â€” any random string
3. Click **Run** â€” Replit will install dependencies and start the server

---

## Project Structure

```
â”œâ”€â”€ client/                  # React frontend
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ components/      # Reusable UI components (sidebar, logo, theme)
â”‚       â”œâ”€â”€ lib/             # Auth context, query client
â”‚       â””â”€â”€ pages/           # App pages (dashboard, compose, bulk, etc.)
â”œâ”€â”€ server/                  # Express backend
â”‚   â”œâ”€â”€ auth.ts              # bcrypt + JWT helpers
â”‚   â”œâ”€â”€ routes.ts            # API routes + background scheduler
â”‚   â”œâ”€â”€ storage.ts           # Drizzle ORM database layer
â”‚   â””â”€â”€ threads.ts           # Threads API integration
â”œâ”€â”€ shared/
â”‚   â””â”€â”€ schema.ts            # Drizzle schema + Zod types
â””â”€â”€ README.md
```

---

## API Reference

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/signin` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/connect-threads` | Save & verify Threads credentials |
| PATCH | `/api/auth/password` | Change password |
| DELETE | `/api/auth/account` | Delete account |

### Content Endpoints (all require Bearer token)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/posts/publish` | Publish immediately to Threads |
| POST | `/api/posts/:postId/repost` | Repost a specific post |
| POST | `/api/posts/:postId/quote` | Quote a specific post with text |
| GET | `/api/posts/:postId/insights` | Get per-post insights |
| POST | `/api/posts/schedule` | Schedule a post |
| GET | `/api/posts/scheduled` | List scheduled posts |
| POST | `/api/bulk-queues` | Create a bulk posting queue |
| GET | `/api/bulk-queues` | List bulk queues |
| PATCH | `/api/bulk-queues/:id` | Pause / cancel a queue |
| POST | `/api/follow-ups` | Schedule a follow-up reply |
| GET | `/api/follow-ups` | List follow-up threads |
| POST | `/api/thread-chain` | Publish a multi-post thread chain |
| GET | `/api/analytics?since=&until=&postsLimit=` | Account analytics + post performance data |
| GET | `/api/analytics/persona` | Audience persona demographics + segment mapping payload |
| GET | `/api/comments?postId=` | Fetch post comments |
| POST | `/api/comments/:id/reply` | Reply to a comment |
| POST | `/api/comments/:id/like` | Like a comment |

---
## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit: `git commit -m "Add your feature"`
4. Push to your branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please follow the existing code style and add `data-testid` attributes to any new interactive elements.

---

## License

This project is licensed under the **MIT License** â€” see the [LICENSE](LICENSE) file for details.

---

## Author

Made with â¤ï¸ by [@iamswayam](https://github.com/iamswayam)

