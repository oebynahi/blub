# Blub project context

Blub is a friends-only photo app with a mobile-friendly website and a native iPhone client, both using the same accounts and backend. The owner wants the core social features working before pursuing more distinctive features. Make focused changes and preserve the interactions they already like. This handoff reflects the mobile feed work through November 24, 2026. Consult Git history for subsequent changes.

## Product and design decisions

- Keep photos chronological and private to their author and accepted friends. Access to the invite-only hosted site and friendship inside Blub are two separate steps.
- The website has a public-facing landing *layout* at `/` and the app at `/feed`, both subject to Sites access controls. Feed, Friends and Profile are the main destinations.
- Mobile feed pages dedicate one vertical swipe to one post. Desktop web uses continuous scrolling. Profiles use a three-column photo grid with pagination. Feed cards show up to two recent comments, oldest to newest within that pair. The full thread opens from the comment control.
- Support profile creation and editing, optional avatars, handle search, friend requests, photo uploads with captions, likes, comments, and confirmed owner-only post deletion. Double-tap likes show the chrome heart. On iPhone the heart also triggers haptic feedback.
- The visual baseline is near-black, high contrast, consistent sans-serif type, purple-to-peach accents and restrained indigo-tinted liquid chrome. Luma inspired the structure. Frutiger Aero inspired the reflective finish. Botanical imagery and large visual overhauls were rejected.
- Use the full chrome symbol beside lowercase **blub**. Center this lockup on iPhone sign-in and give it room at the top of the mobile feed. Photo cards have fine rims, a handle and avatar below the photo, and no display-name overlay or side byline. The profile surface is black with a more pronounced chrome outline.
- The homepage slogan is “Ditch the algorithm and connect for real.” The sample card stays still while its logo follows the cursor. The Open Blub links release randomized emoji from the bottom of the screen to the top at constant speed. Respect reduced motion.

## Where things live

| Area | Entry points |
| --- | --- |
| Web | [Landing page](blub-web/app/page.tsx), [homepage interactions](blub-web/app/home-interactions.tsx), [feed and navigation](blub-web/app/feed/page.tsx), [styles](blub-web/app/globals.css) |
| Post and profile UI | [Web post card](blub-web/app/feed/post-interactions.tsx), [profile grid](blub-web/app/feed/profile-grid.tsx), [web art assets](blub-web/public/) |
| Backend | [Worker API](blub-web/app/api/blub/route.ts), [hosted identity](blub-web/app/chatgpt-auth.ts), [Drizzle schema](blub-web/db/schema.ts), [versioned migrations](blub-web/drizzle/) |
| iPhone | [Xcode project](blub-ios/Blub.xcodeproj), [navigation, wordmark and paging](blub-ios/Blub/BlubApp.swift), [API client](blub-ios/Blub/BlubService.swift), [hosted sign-in](blub-ios/Blub/HostedAccount.swift) |
| Native features | [Photo card and comments](blub-ios/Blub/PostCard.swift), [friends and profile grid](blub-ios/Blub/People.swift), [photo/profile editor](blub-ios/Blub/Editor.swift), [native assets](blub-ios/Blub/Assets.xcassets/) |

The React/TypeScript website runs on Vinext and a Cloudflare Worker. D1 stores users, friendships, posts, likes, comments and avatar references. R2 holds post photos and avatar bytes. The Worker checks access when serving private images and interactions. Avatars appear with searchable profiles. Removing a friend revokes post access. Feed responses cap at 100 posts. Handles in comments, photo credits, Friends, and Activity open member profiles on web and iOS. Signed-in members can see searchable profile details. Profiles also have three independent photo prompts. The highlights table maps each owner and prompt to one R2 photo. Both clients read the prompt list from the API, and only accepted friends can open another member’s answers. The profile grid pages through photos independently and checks friendship on every page. Preview comments come from the feed query, avoiding an extra request per card.

Sites supplies the trusted identity on hosted requests. The native app opens the hosted account flow in WebKit, then uses site-scoped session cookies with an ephemeral URLSession. The user confirmed sign-in works against their real Blub account. A new account authenticates with ChatGPT and then creates a Blub profile. No separate Blub password is stored. The iPhone client points to the hosted site by default.

## Running and shipping

1. Follow the [root README](README.md) for dependency installation, the ordered local migrations, development sign-in, test commands and common setup problems. Run web commands inside `blub-web/`. Local emulator data lives in ignored `.wrangler/state/`.
2. Check web changes with TypeScript and a production build. Run [the integration suite](blub-web/tests/integration.py) against the **local** built Worker on port 8787 for API changes. It uses disposable identities. Check phone and desktop widths separately for feed layout work.
3. Open the Xcode project, select **Blub** and an iPhone simulator, then run. The deployment target is iOS 17+. Xcode 27.2 and an iPhone 18 Pro simulator have been used successfully. Find available simulator IDs with `xcrun simctl list devices available`. Physical-device builds need a signing team. Simulator checks do not validate physical haptics or swipe feel.
4. Commit source changes to the [GitHub repository](https://github.com/oebynahi/blub) on `main`. The root repository tracks real files inside `blub-web/`. That directory also has its own Git metadata for Sites source synchronization. Preserve both workflows and inspect existing local changes before staging, particularly Xcode-generated project edits.
5. Web publication is separate from a GitHub push. Use the Sites workflow to open the existing source, package the tested build, save the version and deploy to the existing shared audience. The project ID is in [hosting.json](blub-web/.openai/hosting.json). The [live site](https://blub-friends.halecashew.chatgpt.site) also serves the iOS API. Never put hosting credentials, session cookies, local test identities or private photos in the repo. iOS-only changes require a new app build.

## Verification and open decisions

- Prior checks cover profile/avatar creation, post uploads and deletion, friendship permissions and revocation, likes, comment retries and pagination. Mobile web paging and its desktop breakpoint were exercised in Chrome. Native builds have run on the simulator, and an unsigned device Release build has compiled.
- Real-device QA for paging, haptics and small-screen layout remains worthwhile. TestFlight distribution has not been established in this project.
- Activity is shared across web and iOS. The bell includes requests, acceptances, comments and grouped likes. Authors can delete their comments. Optional APNs and weekly unread email delivery require provider credentials; see the README for setup and verification.
- Independent identity/hosting was discussed as a future option. Current work uses Sites authentication and the shared D1/R2 backend. Photo replies and shared albums were brainstormed, not scheduled.
