
Implementation plan for SocialSphere (no code yet), based on your answers:

1) What is now locked
- Scope: MVP first.
- Auth in phase 1: Email/password + Google OAuth + password reset.
- Access model: Public profiles; other app areas protected.
- Feed/chat depth: Standard social MVP.
- App shell: Top-nav layout.
- Presence: Realtime presence in v1.
- Media: Uploads enabled with larger limits + image crop.
- Feed loading: Chronological with infinite scroll.
- Build order: /auth → /profile/:id → /feed → /chat → /search → /settings.

2) Architecture I will implement
- Global app foundation:
  - Route guards (public vs authenticated routes).
  - Shared top navigation shell used across protected pages.
  - Global theme/font-size system driven by profile fields (`theme`, `font_size`) and applied on root element.
  - Reusable design tokens/components aligned to your visual system (Inter, gradients, radii, shadows, transitions).
- Data layer:
  - Typed client queries/mutations per existing tables/views only.
  - React Query for caching, optimistic updates where safe.
  - Realtime subscriptions for messages, profiles, friendships, reactions, comments.
- Storage usage:
  - Existing buckets only (`avatars`, `cover-photos`, `post-media`) with client-side validation + crop flow.
- Auth/session:
  - Session bootstrap + auth state listener.
  - Email sign-up/sign-in/sign-out, Google sign-in, forgot/reset password pages/flow.
  - Profile bootstrap handling for first login.

3) Page-by-page build plan
- /auth
  - Tabs/cards for login/register, Google sign-in button, forgot password entry, reset password screen.
- /profile/:id
  - Header (avatar, cover, name, stats), friendship action state machine (add/cancel/accept/decline/remove), user posts list, public visibility handling.
- /feed
  - Composer (status/photo), infinite chronological feed (own + accepted friends), reactions toggle (love/hate), expandable comments.
- /chat
  - Conversation list + active thread, realtime send/receive, unread + read state, online indicators from profile presence.
- /search
  - User search with partial matching, result cards + quick friend/chat actions.
- /settings
  - Theme and font size persistence, profile edit basics, sign out, account UX helpers.

4) Technical details
- Routing
  - Public: /auth, /profile/:id (public-read UX with gated actions).
  - Protected: /feed, /chat, /search, /settings.
- Realtime channels
  - Subscribe to row changes on `messages`, `profiles`, `friendships`, `reactions`, `comments`.
- Feed query strategy
  - Cursor/infinite query ordered by `created_at desc`.
  - Use `friend_feed` view where applicable and merge own posts if needed by query strategy.
- Presence
  - Realtime-driven profile `is_online` updates with lifecycle handling to reduce stale online state.
- UI system
  - Update CSS variables for exact light/dark palette, card/input/modal radii, button gradient, global 0.2s easing, hover scale 1.02, comment accordion animation.

5) Final clarifications needed before I start implementation
- Friendship controls: include “unfriend” + “cancel pending request” in MVP (yes/no)?
- Profile visibility details: on public profiles, should non-friends see full post history or only profile header/basic info?
- Chat scope: strictly 1:1 only for MVP (no group chat), correct?
- Upload limits: confirm max file size target (10MB or 20MB) and allowed formats (jpg/png/webp only?).

Once you confirm these 4 points, I can proceed with implementation in the exact page order you specified.
