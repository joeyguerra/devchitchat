# Build: devchitchat — a small chat app. p2p video and screensharing.

You are a senior Node.js + realtime systems engineer. Build a Discord alternative for ~10 users (gamers) that runs as **one Node process** but enables **peer-to-peer media** between users.

## Values (non-negotiable)
- Decentralized / peer-to-peer by default
- Speed (fast startup, low latency, minimal overhead)
- Simplicity (small mental model, minimal moving parts)
- Local-first (works on a LAN, tolerates internet outage; store-and-forward)
- Minimum dependencies (prefer Node built-ins; avoid heavyweight frameworks)
- Secure by default (sane defaults, least privilege, safe auth/session handling)
- Make things visible (observable state, logs, inspectable queues, explainability)

## Principles (non-negotiable)
- Test-driven design and development (TDD): tests first for all core logic
- Use Node platform primitives: ws/http/crypto/fs, and **SQLite via a native module**
- Prefer explicit protocols and small modules over “magic”
- Compatibility mindset: Hubot is a participant in the chat, not “the app server”
- One-process target: everything in one Node process, but modular architecture
- mobile-first and responsive design

## Deliverable
A repo named `devchitchat` that can be run locally and used by ~10 gamers as a Discord alternative with:
- public rooms
- ad-hoc groups
- text chat
- message search
- store-and-forward delivery
- audio/video streaming
- screen/window/app capture streaming
- multiple simultaneous streams

## Hard constraints
- No cloud dependencies
- Must run on a single machine as a single Node process
- Browser client UI (basic is fine), using Web APIs:
  - WebRTC (audio/video/data)
  - Screen Capture API (getDisplayMedia)
  - LocalStorage + File API for local-first caching/export
  - WebSocket for signaling + control-plane
- Hubot process must act as:
  - signaling server (required)
  - message store + search index
  - presence + room registry
  - store-and-forward relay for text events
  - OPTIONAL: TURN relay support via pluggable config (see below)

## Key architecture decision you must implement
### Media path:
- Default: **WebRTC peer-to-peer** for audio/video/screen streams.
- Hubot provides signaling only (SDP exchange, ICE candidates, auth).
- For NAT traversal:
  - If no TURN configured, it works best on LAN / friendly NATs.
  - Provide a clean integration point to add TURN later (do not bundle a TURN server unless it’s minimal and truly necessary).
- You must explain in README:
  - Why signaling must be centralized (at least per “session”)
  - When TURN is needed
  - Tradeoffs vs centralized media (SFU) and why SFU is out-of-scope for v0 given values

### Control/data path:
- WebSocket to Hubot for:
  - auth
  - room membership / permissions
  - text messages + receipts
  - presence
  - message search queries
  - stream session coordination (who is publishing what)

### Storage:
- SQLite for durable event log (append-only) + projections for:
  - rooms
  - memberships
  - messages
  - delivery state (store-and-forward queue)
  - search index (use SQLite FTS if possible)
- Also local-first client cache:
  - LocalStorage (lightweight cache)
  - Optional export/import via File API (e.g., JSONL)

## Roles / permissions
- One server admin with “super rights”
- Users can create ad-hoc groups
- Public rooms visible to all authenticated users
- Permissions model:
  - admin: can create/delete rooms, ban users, rotate keys, export/import
  - room owner/mod: can invite/kick in ad-hoc groups
  - user: standard

## Security
- Authentication: start simple but secure
  - v0: invite-based registration (invites expire after first use, default 24h)
  - sessions: signed cookies or token-based (your choice), but secure defaults
- Encrypt sensitive things where appropriate:
  - at minimum: password hashing (argon2/bcrypt) if passwords exist
  - prefer invite-token login initially to avoid password UX
- WebRTC security:
  - DTLS-SRTP is default; ensure constraints and safe handling
- Rate limiting / abuse:
  - basic server-side rate limits for auth + message send
- “Make things visible” without leaking secrets:
  - structured logs with redaction

## UX requirements (keep simple)
- Web UI:
  - room list
  - message list
  - message search
  - “Start call” in room / group
  - “Share screen” button
  - show participants + who is streaming
  - support multiple streams (grid layout is fine)
- Minimal styling; function > polish

## Hubot integration requirements
- The Node process is a Hubot instance:
  - Treat the Hubot bot as a first-class participant
  - Hubot can join rooms, respond, moderate, and provide “special capabilities”
- Provide a Hubot script interface:
  - scripts can register commands and receive events from the chat module
  - commands can post messages, create rooms, moderate, etc.
- Must not break standard Hubot patterns; keep adapters clean

## Module surface (you design, but must include these)
- `ChatServer` (WS + HTTP + routing)
- `AuthService` (invites, sessions)
- `RoomService` (public rooms + ad-hoc groups)
- `MessageService` (append-only events + projections)
- `DeliveryService` (store-and-forward, offline queues)
- `SearchService` (SQLite FTS or equivalent)
- `SignalingService` (WebRTC offers/answers/ICE)
- `PresenceService` (who is online/where)
- `HubotBridge` (publish chat events to Hubot + accept bot actions)

## Testing requirements (TDD)
- Use Node’s built-in test runner (`node:test`) unless there’s a strong reason not to.
- Write tests first for:
  - invites (create/redeem/expire)
  - session validation
  - room creation + membership rules
  - message append + retrieval
  - store-and-forward delivery state transitions
  - search indexing and queries
  - signaling message validation and routing (no actual WebRTC in unit tests; mock)
- Add a small number of integration tests:
  - spin up server, connect two ws clients, send/join/search
- Provide a “smoke” script to run locally.

## Minimum dependencies policy
- Default to Node built-ins.
- Allowed:
  - `ws` for WebSocket if you must (or implement with native if feasible)
  - `better-sqlite3` OR `sqlite3` (choose one and justify)
- Avoid:
  - Express (unless you can justify it vs `http`)
  - big frontend frameworks (use vanilla + minimal bundling)
- If you add a dependency, document why it’s necessary.

## Repository structure (suggested)
- /src/server/*
- /src/client/*
- /src/hubot/*
- /test/*
- README.md
- DESIGN.md (architecture + tradeoffs)
- PROTOCOL.md (WS message types + schemas)

## Protocol requirements
- Define explicit message schemas for WS:
  - auth: invite redeem, session refresh
  - rooms: list/join/leave/create
  - messages: send/list/ack
  - search: query/results
  - presence: update/list
  - signaling: offer/answer/ice + stream metadata
- Validate all incoming messages (schema validation can be hand-rolled to avoid deps)

## Implementation plan (two-pass workflow)
### PASS 1 — Design + tests
1) Write DESIGN.md and PROTOCOL.md first.
2) Draft module boundaries and data model.
3) Write unit tests for core services first.
4) Implement minimal server that passes auth/rooms/messages tests.
5) Implement SQLite storage + projections + FTS search.
6) Implement store-and-forward.

### PASS 2 — Real-time media
7) Implement signaling service over WS.
8) Implement client WebRTC flows:
   - 1:1 call in a room
   - then N-way mesh for ~10 users (multiple peer connections)
   - support multiple streams per user (camera + screen)
9) Implement UI:
   - stream grid
   - controls (mute, stop video, stop share)
10) Document NAT/TURN limitations clearly.

## Output requirements
- Provide the full codebase.
- Include run instructions:
  - `npm install`
  - `npm test`
  - `npm start`
- Provide a quickstart:
  - start server
  - generate invite
  - open two browser tabs, join room, send messages, start call, share screen
- Include clear explanations and tradeoffs in README.

## Suggest missing features (add as TODO list in README)
After implementing v0, add a section:
- “Next features” grounded in the values (decentralized, simple, visible, secure)
- Explain why each is valuable and what it costs.

- Invite UI + QR codes (optional): local-first onboarding for a LAN party; still secure.
- E2E encryption for text (room keys): aligns with decentralized + secure; can be phased in (start with transport security + at-rest).
- Device pairing / multi-device: keep it small (10 users) but useful; local-first sync via event log export/import.
- Message retention controls: “keep last N days” or “purge room” (visibility + privacy).
- Moderation basics: mute/kick/ban + audit log (admin super rights, “make visible”).
- Diagnostics page (“Bridge Inspector” vibe): show WS connections, delivery queues, last errors, stream sessions, event counts.
- Backup/restore: one-click export SQLite + attachments; import on new machine.
- Attachments: file share via direct P2P data channels when possible; fallback store-and-forward through Hubot if needed (small files).
- Presence + push-to-talk: gamer-friendly, still simple.

Now proceed with PASS 1. Do not implement PASS 2 until PASS 1 tests are passing.
