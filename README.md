# ThreadFlow

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20PostgreSQL-teal" alt="Stack" />
  <img src="https://img.shields.io/badge/Status-Active-brightgreen" alt="Status" />
</p>

**ThreadFlow** is a full-stack social media management app for [Meta Threads](https://www.threads.net). Schedule posts, send bulk threads in sequence, manage follow-up replies, and handle comments — all from one clean dashboard.

---

## Screenshots

> _Add your screenshots here_

---

## Features

- 🔐 **Multi-user auth** — Signup/signin with email & password (bcrypt + JWT)
- 👤 **Per-user Threads credentials** — Each account stores its own Threads API tokens
- ⏰ **Post Scheduler** — Schedule threads for a specific date and time
- 📦 **Bulk Posting** — Send multiple threads in sequence with configurable delays and drag-and-drop reordering
- ⏱️ **Follow-Up Threads** — Auto-schedule a timed reply to any post with a live countdown timer
- 💬 **Comment Manager** — View, reply to, and like comments on any post
- 🔔 **Notification Bell** — Activity feed in the header
- 🌙 **Dark/Light Mode** — Dark by default, matching the Threads aesthetic
- ⚙️ **Settings Page** — Update API credentials, change password, delete account
- 📱 **Mobile Responsive** — Collapsible sidebar with hamburger menu

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui + TailwindCSS |
| Animations | Framer Motion |
| Data Fetching | TanStack Query v5 |
| Routing | Wouter |
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

Create a `.env` file or set these environment variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/threadflow
SESSION_SECRET=your-secret-key-here
```

> `JWT_SECRET` is optional — it falls back to `SESSION_SECRET` if not set.

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

## Setting Up Meta Threads API

To enable live posting, you need credentials from the [Meta Developer Portal](https://developers.facebook.com/apps/).

### Step 1: Create a Meta App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps/)
2. Click **Create App** → choose **Business** type
3. Enable **Threads API** under your app's products

### Step 2: Generate an Access Token

1. In your app, go to **Threads API** → **Permissions**
2. Enable: `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, `threads_manage_insights`
3. Go to **Threads API** → **Generate Token**
4. Click **Generate Token** and copy the **Long-Lived Access Token**

### Step 3: Connect in ThreadFlow

1. Sign up / Sign in to ThreadFlow
2. You'll be prompted to **Connect your Threads Account**
3. Paste your:
   - **Access Token** (required)
   - **App ID** (optional — found in App Settings → Basic)
   - **App Secret** (optional — found in App Settings → Basic)
4. Click **Connect Account**

ThreadFlow will verify your token by fetching your profile. Once connected, all scheduling and posting features are live.

---

## Self-Hosting on Replit

1. Fork or import this repo into [Replit](https://replit.com)
2. Set the following Replit Secrets:
   - `DATABASE_URL` — your PostgreSQL connection string (Replit provides one automatically)
   - `SESSION_SECRET` — any random string
3. Click **Run** — Replit will install dependencies and start the server

---

## Project Structure

```
├── client/                  # React frontend
│   └── src/
│       ├── components/      # Reusable UI components (sidebar, logo, theme)
│       ├── lib/             # Auth context, query client
│       └── pages/           # App pages (dashboard, compose, bulk, etc.)
├── server/                  # Express backend
│   ├── auth.ts              # bcrypt + JWT helpers
│   ├── routes.ts            # API routes + background scheduler
│   ├── storage.ts           # Drizzle ORM database layer
│   └── threads.ts           # Threads API integration
├── shared/
│   └── schema.ts            # Drizzle schema + Zod types
└── README.md
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
| POST | `/api/posts/schedule` | Schedule a post |
| GET | `/api/posts/scheduled` | List scheduled posts |
| POST | `/api/bulk-queues` | Create a bulk posting queue |
| GET | `/api/bulk-queues` | List bulk queues |
| PATCH | `/api/bulk-queues/:id` | Pause / cancel a queue |
| POST | `/api/follow-ups` | Schedule a follow-up reply |
| GET | `/api/follow-ups` | List follow-up threads |
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

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Author

Made with ❤️ by [@iamswayam](https://github.com/iamswayam)
