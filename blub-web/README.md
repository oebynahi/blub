# Blub

A relaxed, friends-only social app. This first version is a responsive website with a shared API, D1 database, and private R2 photo storage.

## Included

- ChatGPT sign-in and editable profiles with unique handles.
- Handle search, friend requests, accept/decline/cancel, and remove friend.
- Photo posts (JPEG, PNG, WebP, up to 8 MB) with optional captions.
- A chronological feed showing your posts and accepted friends' posts, newest first.
- Authenticated photo delivery; removing a friendship revokes feed and image access.
- Owner-only post deletion, keyboard-accessible dialogs, and mobile navigation.

This version returns the most recent 100 visible posts. It has no ranking, public posts, likes, comments, or notifications. Names, handles, and bios can be found by signed-in users; photos require an accepted friendship. Photos do not automatically strip EXIF metadata yet.

## Architecture

`app/page.tsx` is the client interface. `app/api/blub/route.ts` is the shared JSON/multipart API. `db/schema.ts` and `drizzle/` define the durable schema. `.openai/hosting.json` declares `DB` and `BUCKET`. Identity comes from Sites' trusted authenticated visitor headers, never client-submitted account IDs. Hosted authentication is managed by Sites; native mobile clients would need a supported authentication adapter before using this API.

The hosted Site starts owner-private. To test with real friends, grant them access in Sites sharing settings. App-level friendships further limit photo access after sign-in. No example accounts or photos are seeded in production.

## Local development

Requires Node 22.13+ (Node 24 recommended).

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_vermin.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fine_dark_phoenix.sql
npm run dev
```

Apply each migration once to a new local database. Local sign-in uses the starter's development-only Seedy identity. Hosted identity remains platform-managed. D1/R2 preview state is isolated in ignored `.wrangler/state`.

## Validation

```sh
npx tsc --noEmit
npm run build
npm start -- --port 8787
# In another terminal:
python3 tests/integration.py
```

The integration test sends identity headers directly to a loopback-only built Worker, creates disposable local profiles, and verifies friendship authorization, ordering, uploads, image privacy, revocation, and deletion. Do not direct it at a hosted environment. Production dispatch authenticates and supplies visitor identity.

## API

- `GET /api/blub`: current profile, friendships, and latest visible posts.
- `GET /api/blub?action=search&q=handle`: prefix search for profiles.
- `GET /api/blub?action=photo&id=post-id`: authorized photo bytes.
- `POST /api/blub` JSON: `profile`, `request`, `accept`, `remove`, or `delete` action.
- `POST /api/blub` multipart: `photo` file and `caption` text.

All writes require identity. Account setup is required for posting and friendships. Mutations reject cross-origin browser requests. Photo types are checked using file signatures, and storage keys never appear in feed responses.
