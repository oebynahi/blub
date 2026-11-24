# Blub

Blub is a mobile-friendly, friends-only photo app. The website has a separate homepage and a working app at `/feed`, backed by a shared API and persistent database and photo storage.

## What works

- Sign in with ChatGPT and create a profile with a unique handle.
- Find people by handle; send, accept, decline, or cancel friend requests.
- Post a JPEG, PNG, or WebP photo (up to 8 MB) with an optional caption.
- Read a chronological feed of your posts and accepted friends’ posts, newest first.
- Remove friends and delete your own posts. Photo access is checked on the server.

The feed currently returns up to 100 visible posts. People who can see a post can like it and read or leave comments. Profile pictures are optional and visible alongside searchable profiles. Names, handles, and bios are searchable by signed-in users; photos require friendship. Removing a friend revokes access in Blub, but cannot remove copies someone already saved. Uploaded photos do not have their EXIF metadata stripped yet.

## Stack and repository layout

The application lives in **`blub-web/`**. Run all npm commands there.

| Location | Purpose |
| --- | --- |
| `blub-web/app/page.tsx` | Introductory homepage at `/` |
| `blub-web/app/feed/page.tsx` | Feed, friends, profile, and post composer |
| `blub-web/app/api/blub/route.ts` | Shared JSON and multipart API |
| `blub-web/app/chatgpt-auth.ts` | Reads authenticated visitor identity |
| `blub-web/app/globals.css` | Shared dark theme and responsive styles |
| `blub-web/db/schema.ts` | Drizzle schema: users, friendships, posts |
| `blub-web/drizzle/` | Versioned SQL migrations and schema snapshots |
| `blub-web/worker/index.ts` | Cloudflare Worker entry point |
| `blub-web/.openai/hosting.json` | Existing Site identity and storage bindings |
| `blub-web/scripts/` | Cross-platform install, build, and development helpers |
| `blub-web/tests/integration.py` | Local backend integration checks |

React and TypeScript power the UI. Vinext implements the Next.js App Router APIs on Vite and Cloudflare Workers. D1 stores records; R2 stores photo files. Drizzle manages the schema. The existing Sites integration handles hosted identity and deployment.

## Local setup

You need Git and **Node.js 22.13 or later** with npm. Node 24 LTS is a good default. Python 3 is optional, for the backend integration test. Wrangler is installed with the project; no global CLI installation is needed.

A local development session needs **no Cloudflare login, API keys, production credentials, or Sites plugin**. The project emulates D1 and R2 locally and provides a development-only sign-in identity.

### 1. Clone and install

```sh
git clone https://github.com/oebynahi/blub.git
cd blub/blub-web
npm run install:ci
```

`install:ci` installs the locked dependencies, including development and optional packages. Allow the package manager’s normal dependency setup to finish before building.

### 2. Build and initialize a fresh local database

```sh
npm run build
```

The build generates `dist/server/wrangler.json`, including the local `DB` and `BUCKET` bindings. Then apply the existing migrations **once, in this order**, to a fresh local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_vermin.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fine_dark_phoenix.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_post_interactions.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_profile_pictures.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_activity.sql
```

These commands affect only local state. Do not add `--remote`. They execute SQL files directly and do not track which files you have applied; record the last migration you ran and apply only new ones afterward. A “table already exists” error usually means a migration was replayed.

### 3. Start the app

```sh
npm run dev
```

Open the URL printed by the server, normally **http://127.0.0.1:5173**. `/` is the homepage; `/feed` is the app. Use the sign-in button to create a local session, then create a profile and try posting a photo.

Local sign-in uses the fixed identity `Seedy` (`seedy@sites.test`) on loopback addresses. It does not contact ChatGPT or create a real account. Sign-out clears that local session. Multiple browser windows share the same simulated identity; they are not separate users. The integration test below covers multiple disposable identities against a built local Worker.

Stop the server with Ctrl+C. To use another port:

```sh
npm run dev -- --port 5174
```

### Local data and configuration

- `.wrangler/state/` contains your local database and uploaded photos. It is ignored by Git and shared by the dev and built preview servers.
- `dist/`, `node_modules/`, `.vinext/`, and `.sites-runtime/` are generated or machine-local, not source files.
- `.env*` and `.dev.vars*` are ignored. No environment file is required for the current app.
- Keep `.openai/hosting.json` unchanged for normal collaboration. Its project ID identifies the existing hosted Blub instance; its `DB` and `BUCKET` declarations are used for local emulation too.
- A clean GitHub clone defaults to the portable execution profile automatically. You do not need to copy another developer’s `.sites-runtime/` directory.

## Validation

From `blub-web/`:

```sh
npx tsc --noEmit
npm run build
```

To test backend behavior, initialize the local database as above, then run the built Worker:

```sh
npm start -- --port 8787
```

In a second terminal, from the same `blub-web/` directory:

```sh
python3 tests/integration.py
```

On Windows, use `py -3 tests/integration.py` if that is your Python launcher. The test targets only `http://127.0.0.1:8787`, creates disposable local profiles, uploads test photos, and checks ordering, friendship acceptance, photo privacy, access revocation, and owner-only deletion. It removes its posts afterward; disposable profiles remain locally.

The built Worker does **not** simulate browser sign-in. Use `npm run dev` for interactive sign-in; use `npm start` for checking production output and the integration test. Test identity headers are appropriate only for this loopback Worker. Hosted identity headers must come from the trusted platform.

## Changing the database

1. Edit `db/schema.ts`.
2. Run `npm run db:generate`.
3. Review the new SQL file and Drizzle metadata; commit both.
4. Build if necessary to generate the Wrangler configuration, then apply each new SQL file locally using the command pattern above.
5. Run the relevant checks before opening a pull request.

Do not edit migrations that have already been applied. Add a new migration instead. Hosted migrations are applied by the Sites publishing workflow, independently of your local database.

## Working together

Create a branch from current `main`, keep changes focused, and open a pull request:

```sh
git switch main
git pull --ff-only
git switch -c your-name/short-description
```

The visual baseline is the dark Luma-inspired interface: consistent typography, clear contrast, restrained gradients, and small translucent highlights. Make incremental changes to the existing components; avoid replacing the visual direction for an isolated request. Keep copy concise and descriptive.

Never commit real user data, local database files, uploaded photos, credentials, generated build output, or dependency directories. Collaborators need GitHub repository access to contribute. Access to the hosted app is managed separately in Sites sharing settings.

## Deployment and authentication

Pushing to GitHub stores source code; **it does not automatically deploy Blub**. The current hosting workflow builds the app, pushes the exact source to the Site’s hosting repository, packages the Worker output, and deploys it through Sites. Deployments should use the same source revision that passed validation.

The current hosted Site is owner-private. Invite testers through its Sites access settings, then use Blub friend requests to establish photo access. Site access and app-level friendship are separate checks.

Hosted sign-in is handled by Sites, which provides trusted visitor identity headers. Do not deploy the Worker directly on an unprotected public endpoint without adding a real authentication boundary. Native mobile clients would also need a supported authentication adapter before reusing this API.

## API overview

| Request | Purpose |
| --- | --- |
| `GET /api/blub` | Current profile, friendships, latest visible posts |
| `GET /api/blub?action=search&q=handle` | Prefix search for profiles |
| `GET /api/blub?action=photo&id=post-id` | Authorized photo bytes |
| `GET /api/blub?action=comments&id=post-id` | Latest 30 comments, with optional `before` cursor for older comments |
| `POST /api/blub` with JSON | `profile`, `request`, `accept`, `remove`, `delete`, `like`, `unlike`, `comment` actions |
| `POST /api/blub` with multipart form data | Photo file and optional caption |

All writes require identity. Posting and friendships also require a profile. Authorization is checked server-side for each operation and photo request; storage keys are not exposed in feed responses.

## Common setup problems

- **Missing table:** build once and apply the local migrations to `.wrangler/state` from `blub-web/`.
- **Sign-in does not work:** use the dev server on `localhost` or `127.0.0.1`. The built preview does not implement the development sign-in flow.
- **Port in use:** stop the other process or pass `--port` as shown above.
- **Missing Wrangler config:** run `npm run build` before database commands or `npm start`.
- **Install fails:** check the Node version and network access, then rerun `npm run install:ci`. Avoid changing the lockfile just to bypass an installation problem.
- **Database schema differs from a teammate’s:** check which migrations each person has applied. Local state is not shared between machines.

## iPhone app

Open `blub-ios/Blub.xcodeproj` in Xcode, select the **Blub** scheme and an iPhone simulator, then press **⌘R**. The SwiftUI target supports iOS 17 and later. Running on a physical iPhone also requires selecting your Apple development team in **Signing & Capabilities**.

The native app has Feed, Friends, and Profile tabs. Choose **Create an account** to authenticate with an invited ChatGPT account and create a Blub profile, or **Sign in to Blub** to use an existing one. Both use Blub’s existing hosted identity and privacy rules. Sign out from the Profile menu.

Use the plus in Feed to choose and share a photo. Double-tap a photo for the chrome heart and haptic, or use the heart and comment controls. Friends supports handle search, requests and removal. Profile includes a paginated photo grid, editing, profile pictures and owner-only post deletion. The app keeps private photo responses out of the disk cache.

The iOS build points to the hosted Blub backend. Simulator builds run independently of the website's build and deployment.

## Activity and delivery

The bell on both clients opens the account’s Activity inbox. Friend requests, acceptances, comments on your photos and grouped likes are recorded with the originating write. Opening the inbox marks the displayed items read across devices. Removing the friendship, comment or post removes dependent activity. Comment authors can delete their own comments from the full thread.

Push and email require server-side provider credentials. Configure these as hosted runtime variables and keep the keys out of Git.

| Channel | Setup | Behavior |
| --- | --- | --- |
| iPhone push | Enable Push Notifications for App ID `com.oebynahi.blub` with an Apple Developer team and refresh its provisioning profiles. Set `APNS_TEAM_ID`, `APNS_KEY_ID`, and `APNS_PRIVATE_KEY` (the contents of the APNs .p8 key). Debug uses sandbox APNs; distribution uses production. | Opt in from Activity or after sending a friend request. Comments and requests generate generic lock-screen alerts. Tapping an alert checks account access again. Sign-out detaches the device. |
| Occasional email | Verify a sender domain in Resend. Set `RESEND_API_KEY` and `BLUB_EMAIL_FROM` to the provider key and verified From address. | Opt in or out from Activity. The first reminder is eligible seven days after opting in. Reminders require new unread activity and are capped at one per week. Email goes to the address from hosted sign-in. |

The Worker declares a ten-minute cron trigger and also checks pending deliveries after API traffic. Verify the hosting deployment installs the trigger before relying on delivery during idle periods. Push jobs retry transient errors and expire after a day. The email dispatcher uses a per-account delivery lease and provider idempotency key. Lock screens and emails omit comment text and private photos. End-to-end external delivery requires a provisioned iPhone and configured provider accounts.
