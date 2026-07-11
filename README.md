# SCRS Gravitas Team Management App

Team management and participant onboarding app for the SCRS Gravitas
`ESCAPE.EXE II` event. The app supports participant Google sign-in, team
creation, joining, random allocation, admin team management, and Supabase-backed
data recovery through versioned SQL migrations.

Live app: [https://escape-exe-team-management-website.vercel.app](https://escape-exe-team-management-website.vercel.app)

## Features

- Participant login with Supabase Google Auth, restricted to `@vitstudent.ac.in`
- Participant onboarding with username and password fallback
- Team creation with event date and half-hour slot selection
- Slot capacity enforcement: maximum 2 teams per event/date/slot
- Team join, leave, disband, leader handover, and join-request flows
- Admin dashboard for viewing, renaming, scoring, merging, and editing teams
- Random pool for registered participants who are not currently in a team
- Server-side API routes for writes, protected by Supabase service-role access
- Reproducible Supabase schema in `supabase/migrations`

## Tech Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 15 |
| Language | TypeScript |
| UI | React, Tailwind CSS, Radix UI |
| Auth and Database | Supabase |
| Password Hashing | bcryptjs |
| Deployment | Vercel |

## Project Structure

```text
src/
  app/                 Next.js pages and API routes
  components/          Reusable UI components
  hooks/               Shared React hooks
  lib/                 Supabase client, auth helpers, types, utilities
supabase/
  migrations/          Versioned database schema
docs/                  Project documentation
package.json           Scripts and dependencies
vercel.json            Vercel build configuration
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project
- A Google Cloud OAuth client
- A Vercel project for production deployment

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

ADMIN_SETUP_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
```

Never commit real `.env.local` values. The service-role key and admin setup
values are server-side secrets.

## Supabase Setup

Run the canonical migration in your Supabase SQL editor:

```text
supabase/migrations/20260701000100_rebuild_escape_exe_schema.sql
```

This migration creates:

- `admin`
- `users`
- `event_registration`
- `teams`
- `random_pool`
- `join_requests`
- `team_members_view`

It also enables RLS, adds read-only authenticated policies, protects password
columns with column-level grants, enforces team/member constraints, enforces the
2-teams-per-slot rule, and adds a database backstop for `@vitstudent.ac.in`
Google accounts.

## Google OAuth Setup

In Google Cloud Console, configure the OAuth client as follows.

Authorized JavaScript origin:

```text
https://escape-exe-team-management-website.vercel.app
```

Authorized redirect URI:

```text
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

In Supabase, go to `Authentication -> Providers -> Google`, enable Google, and
add the Google Client ID and Client Secret.

Then go to `Authentication -> URL Configuration` and set:

```text
Site URL:
https://escape-exe-team-management-website.vercel.app

Redirect URL:
https://escape-exe-team-management-website.vercel.app/auth/callback
```

You do not need Supabase OAuth Server or Supabase OAuth Apps for this project.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Available Scripts

```bash
npm run dev        # Start local development server
npm run build      # Create production build
npm run start      # Start production server
npm run typecheck  # Run TypeScript checks
```

## Deployment

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Use the Next.js framework preset.
4. Add every variable from `.env.example` to Vercel Project Settings.
5. Deploy.

After deployment, create the first admin account:

```bash
curl "https://escape-exe-team-management-website.vercel.app/api/admin/setup-admin?token=YOUR_ADMIN_SETUP_TOKEN"
```

The setup route stores the admin password as a bcrypt hash.

## Participant Registration Data

Participants must exist in `event_registration` before they can sign in. Minimum
required fields:

```text
event_key   = escape-exe-ii
user_email  = student@vitstudent.ac.in
reg_no      = 21BCE0000
event_date  = YYYY-MM-DD
```

## Security Notes

- Real secrets belong in `.env.local` and Vercel environment variables only.
- All database writes should go through server-side API routes.
- `SUPABASE_SERVICE_ROLE_KEY` is required for write routes because RLS blocks
  anonymous/client-side writes.
- Admin and participant fallback passwords are hashed with bcrypt.
- Auth is restricted at three layers: Google OAuth hint, app/API checks, and the
  Supabase `auth.users` trigger in the migration.

## Verification Checklist

After deploying, test:

- Google login with an `@vitstudent.ac.in` account
- Rejection of non-`@vitstudent.ac.in` accounts
- Participant onboarding
- Team creation with date/slot
- Join, leave, disband, and leader handover flows
- Admin login
- Admin random pool and team-management actions

## Author

Yash Kashyap

[GitHub Profile](https://github.com/yash120704)
