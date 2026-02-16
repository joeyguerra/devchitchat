devchitchat — A small chat app.

Purpose
Build a chat app for ~10 gamers that runs as a single Node process (a Hubot instance) and provides:
- Public rooms + ad-hoc private groups
- Text chat + search
- Local-first store-and-forward messaging
- WebRTC-based P2P audio/video + screen/window/app sharing
- Multiple simultaneous streams
The Hubot process is a first-class participant with special capabilities (moderation, automation, visible diagnostics).

Values and how they shape architecture
Decentralized / peer-to-peer
- Media is P2P via WebRTC (mesh for ~10 users).
- Server is control-plane only (signaling, auth, room registry, message persistence).
- Optional TURN support is a plug-in configuration, not a bundled dependency.

Speed
- One process, minimal middleware.
- SQLite projections for fast reads; append-only event log for writes.
- Simple WebSocket protocol; avoid heavy frameworks.

Simplicity
- Explicit modules with small responsibilities.
- Event log + projections; no complicated distributed consensus.
- Minimal UI: room list, messages, search, call controls, stream grid.

Local-first
- Server persists to SQLite locally.
- Client caches recent data locally (LocalStorage).
- Store-and-forward for text messages and control events.
- Export/import of DB for backup and migration.

Secure
- Invite-based onboarding, expiring, one-time by default.
- Strong session handling and strict WS message validation.
- Least privilege permissions (admin vs room owner/mod vs user).
- Log redaction and safety by default.

Make things visible
- Diagnostics page showing queues, presence, call sessions, WS connections, recent errors.
- Event log is inspectable.
- Structured logs with trace IDs.

Non-goals (v0)
- Large-scale (100s/1000s) rooms
- Centralized media routing (SFU/MCU)
- End-to-end encryption (E2EE) for messages
- Mobile native app
- Complex roles/permissions beyond admin/owner/mod/user

System overview

Runtime components
	1.	Hubot Node process (single process)

- HTTP server for static client + small admin/diagnostic endpoints
- WebSocket server for control-plane protocol
- SQLite database for durable storage
- Hubot adapter/bridge for bot participation
- Signaling service for WebRTC rendezvous
- Store-and-forward delivery and offline queue management

	2.	Browser client (vanilla JS + minimal UI)

- WebSocket connection to server
- Local cache (LocalStorage) + optional file export/import
- WebRTC peer connections (mesh)
- Screen capture via getDisplayMedia
- Media element grid rendering multiple streams
- Basic room navigation and message search

Why signaling is centralized
WebRTC requires exchanging session descriptions (SDP) and ICE candidates between peers. Peers need a rendezvous point to find each other and exchange these messages securely. For a small group, a single Hubot process can provide this rendezvous (signaling) while keeping actual media peer-to-peer.

Why TURN is optional
TURN is needed when peers cannot establish direct connections due to NAT/firewall restrictions. For LAN parties or friendly NATs, STUN-only often works. Running a TURN server adds complexity and dependencies. v0 supports TURN credentials/configuration but does not bundle a TURN server by default.

Why SFU is out-of-scope for v0
An SFU centralizes media forwarding. It improves bandwidth scaling but increases complexity, CPU usage, and dependency surface. For 10 users, a mesh is acceptable and aligns with decentralization and simplicity.

Topology choices

Text/control plane
- WebSocket client ↔ Hubot server
- Server persists events and broadcasts room events

Media plane (WebRTC)
- Mesh topology:
- Each participant establishes peer connections to each other participant in the call.
- Each publisher can publish multiple streams (camera + screen, etc).
- For each peer connection:
- DTLS-SRTP secured media
- Optional data channel (future: file transfer)

Data model (SQLite)

Core idea: append-only event log + projections
- All state changes are events (append-only).
- Projections are tables optimized for reads (rooms, memberships, messages).
- This makes state visible and debuggable.

Tables (suggested)
	1.	users

- user_id (pk)
- handle (unique)
- display_name
- roles (csv or json; includes “admin”)
- created_at

	2.	sessions

- session_id (pk)
- user_id (fk)
- token_hash (or opaque id referencing server-side store)
- created_at, expires_at, revoked_at
- last_seen_at

	3.	invites

- invite_id (pk)
- token_hash
- created_by_user_id
- created_at, expires_at
- max_uses, uses
- redeemed_by_user_id (nullable)
- note

	4.	rooms

- room_id (pk)
- kind (“public” | “group”)
- name
- topic
- visibility (“discoverable” | “hidden”) mainly for groups
- created_by_user_id
- created_at
- deleted_at (nullable)

	5.	room_members

- room_id
- user_id
- role (“owner” | “mod” | “member”)
- joined_at
- left_at (nullable)
- banned_at (nullable)
(primary key: room_id + user_id)

	6.	events (append-only)

- event_id (pk, autoincrement)
- ts (epoch millis)
- actor_user_id
- scope_kind (“server” | “room” | “call”)
- scope_id
- type (string)
- body_json
- trace (string)
This is the audit trail and source of truth for “what happened”.

	7.	messages (projection)

- msg_id (pk)
- room_id
- seq (monotonic per room)
- user_id
- ts
- text
- client_msg_id (optional)
- deleted_at (nullable)

	8.	deliveries (store-and-forward)

- delivery_id (pk)
- user_id
- room_id
- after_seq (the next seq the user needs)
- last_delivered_at
- status (“active” | “paused”)

	9.	fts_messages (search)
Use SQLite FTS5 if available.

- rowid references messages
- indexed text, optionally room_id as an unindexed column
Search returns msg_id/seq/snippets.

	10.	calls (optional persistence)

- call_id (pk)
- room_id
- created_by_user_id
- created_at
- ended_at
- topology (“mesh”)
- meta_json

	11.	call_peers (optional)

- call_id
- peer_id
- user_id
- joined_at
- left_at

Services and responsibilities

ChatServer
- Hosts HTTP + WS endpoints
- Serves static client assets
- Attaches request IDs / trace IDs
- Routes WS messages to domain services

AuthService
- Invite creation (admin)
- Invite redeem → user creation
- Session creation/validation/revocation
- Rate limit auth actions
- Exposes “getUserFromSession”

RoomService
- Room list (public + groups user belongs to)
- Room create (public and group)
- Join/leave rules
- Group invite tokens and membership changes
- Emits room events

MessageService
- msg.send: validate, persist event + projection, assign seq
- msg.list: range fetch by seq
- msg.read: read receipts (optional)
- Publishes msg.event to subscribers

DeliveryService
- Tracks per-user per-room delivery watermark (after_seq)
- On reconnect:
- server can push missed messages or client can pull with msg.list
- Store-and-forward semantics:
- “messages are durable; clients catch up by seq”
- This is the backbone for offline tolerance

SearchService
- Maintains FTS index on message insert
- search.query with scope enforcement (room membership)
- Returns ranked hits + snippet

PresenceService
- Tracks current WS connections and which rooms they are “active” in
- Emits presence events
- Provides snapshot to subscribers
- Not durable truth, but helpful UX

SignalingService
- Owns call sessions:
- create call in room
- join call
- map user connection → peer_id
- Validates:
- user is in room
- payload size limits
- to_peer_id exists in call
- Forwards:
- offer/answer/ice to specific peer
- Broadcasts stream metadata events:
- published/unpublished/updated

HubotBridge
- Presents Hubot as a “user”
- Routes bot.command messages to Hubot’s command registry
- Allows Hubot scripts to:
- post messages
- create rooms
- moderate
- query status
- Publishes chat events to Hubot (room join, message posted, etc.)

DiagnosticsService (Make it visible)
- HTTP page or route returning JSON:
- online users
- active rooms
- active calls and peers
- store-and-forward watermarks
- recent errors
- queue sizes
- Redacts secrets

Security design

Authentication flow
- Admin creates invite token (one-time, expires).
- New user opens app, redeems invite with handle/display name.
- Server returns a session token or sets an HttpOnly secure cookie.
- All WS messages require valid session after hello.

Authorization rules
- room.list: only returns public rooms + groups user belongs to
- room.join: public allowed; group requires membership (or redeem a group invite)
- msg.send/list/search: must be room member (or public room member after join)
- rtc calls: must be room member
- admin actions: require admin role

Message validation
- Strict envelope validation
- Per-message body schema validation (hand-rolled)
- Reject unknown fields for sensitive endpoints (auth/admin)
- Enforce size limits for text and signaling payloads

Rate limiting
- Auth endpoints: low thresholds
- msg.send: small burst allowed; protect from spam
- rtc signaling: protect from flooding; size limits

Secrets and storage
- Token hashing at rest (invites/sessions)
- Passwords optional (avoid in v0 if possible)
- SQLite file permissions documented

Client architecture

Client state
- session_token cached (or cookie-based session)
- local cache:
- current user
- room list
- recent messages per room
- last seen seq per room
- offline queue:
- outgoing msg.send pending until msg.ack
- reconnect triggers re-sync of missed messages via msg.list

UI components (simple)
- Left sidebar: rooms + groups
- Main pane:
- message list
- composer
- search bar (scoped to room)
- Call controls:
- start/join/leave call
- toggle mic/cam
- share screen/window/app
- Streams grid:
- show each peer’s published streams as tiles
- allow multiple streams per peer (cam + screen)

WebRTC flows (mesh)

Call create / join
	1.	User clicks “Start call”:

- rtc.call_create → call_id
- rtc.join → peers list

	2.	For each existing peer:

- create RTCPeerConnection
- add local tracks (mic/cam optional, screen optional)
- createOffer → rtc.offer to that peer

	3.	Receiving peer:

- on rtc.offer_event:
- setRemoteDescription
- add their tracks
- createAnswer → rtc.answer

	4.	Both sides exchange ICE candidates:

- rtc.ice messages via server forwarding

Multiple streams per peer
- Add additional track(s) to existing RTCPeerConnection when publishing screen
- Announce stream metadata via rtc.stream_publish so UI can render intent/labels
- Remote side will get ontrack events and map them to stream tiles
- If per-stream negotiation is needed, use renegotiation:
- in mesh, keep it simple: adding tracks triggers renegotiation offer/answer to affected peers

Bandwidth expectations
- Mesh is O(n^2) connections:
- For 10 users, 45 peer links; can be heavy if everyone streams HD.
- Mitigations in v0:
- default low resolution for camera
- allow only one screen share at a time per room (optional rule)
- provide UI hints and warnings

Sequence diagrams (text)

A) Connect + authenticate
Client → Server: hello (resume token optional)
Server → Client: hello_ack
Client → Server: auth.invite_redeem (if not authenticated)
Server → Client: auth.session
Client → Server: room.list
Server → Client: room.list_result

B) Join room + catch up
Client → Server: room.join
Server → Client: room.member_event (join)
Client → Server: msg.list (after_seq = last_seen)
Server → Client: msg.list_result
Client renders messages and updates last_seen seq locally

C) Send message (offline tolerant)
Client queues msg.send locally with client_msg_id
Client → Server: msg.send
Server persists message (event + projection + fts)
Server → Client (sender): msg.ack (authoritative msg_id + seq)
Server → Clients (room): msg.event
Client marks local queued message as delivered by matching client_msg_id

D) Search
Client → Server: search.query (room scope)
Server → Client: search.result
Client navigates to message seq and highlights snippet

E) Start call + publish screen
Client A → Server: rtc.call_create
Server → Client A: rtc.call (call_id + ICE servers)
Client A → Server: rtc.join
Server → Client A: rtc.participants (peers)
Client A ↔ Clients (B,C…): rtc.offer/answer/ice via server forwarding
Client A: getDisplayMedia → addTrack to each peer connection → renegotiate as needed
Client A → Server: rtc.stream_publish (stream metadata)
Server → Room: rtc.stream_event (published)

Observability and “make visible”

Diagnostics endpoint (/diag)
- JSON or simple HTML page showing:
- server uptime
- active WS connections (sid, user, rooms)
- presence snapshot
- active calls: call_id, room_id, peers, streams
- message stats: counts per room, last seq
- delivery watermarks per user/room
- recent errors (redacted)
- rate limit counters

Logging
- Structured logs (JSON lines) with trace IDs
- Redaction of tokens and secrets
- Key lifecycle events:
- invite created/redeemed
- user login/logout
- room created/joined/left
- message persisted
- call started/joined/ended
- signaling forwarded counts and sizes

Tradeoffs and explicit decisions

Why one Node process
- Small group size + simplicity.
- Easier deployment (one binary/runtime).
- Lower operational burden.

Why SQLite
- Local-first durability.
- Fast reads with projections.
- FTS for search without external services.
- Easy backup: copy one file.

Why event log + projections
- Debuggability and audit trail.
- “Make things visible”: reconstruct what happened.
- Easier to evolve features by adding new event types.

What we are not doing in v0
- SFU media routing.
- Bundled TURN server (config hook only).
- E2EE text.
- Rich moderation tooling beyond basics.

V0 milestones (implementation plan)

Milestone 0: repo + skeleton
- minimal HTTP server
- WS handshake (hello/hello_ack)
- tests harness

Milestone 1: auth + invites (TDD)
- admin invite create (maybe via CLI at first)
- redeem invite
- sessions

Milestone 2: rooms + memberships (TDD)
- public room list/create/join/leave
- group create/invite/join

Milestone 3: messages + store-and-forward (TDD)
- msg.send/ack/event
- msg.list pagination by seq
- delivery watermark tracking

Milestone 4: search (TDD)
- SQLite FTS index
- search.query/result

Milestone 5: signaling (TDD for routing/validation)
- call create/join/participants
- offer/answer/ice forwarding
- stream metadata events

Milestone 6: client UI + WebRTC integration
- minimal UI for rooms/messages/search
- call/join
- camera/mic
- screen share
- multi-stream grid

Milestone 7: diagnostics and polish
- /diag
- better errors
- basic rate limiting
- export/import (optional)

Open questions (documented, but don’t block v0)
- Should calls persist across server restart? (probably no in v0)
- Should group invites be separate from server invites? (yes, as defined)
- Should we enforce “one screen share at a time” for bandwidth? (optional)
- Should we allow attachments in v0? (defer; data channel in vNext)

Next features (TODO list aligned with values)
- Attachments via WebRTC DataChannel with server fallback
- E2EE for text (room keys, rotation)
- Push-to-talk + voice activity indicator
- Backup/restore UI (export SQLite + optional media metadata)
- Moderation log viewer
- Local LAN discovery (mDNS) for “find server on network” without typing IP
- Per-room retention policy (auto purge)
- Theme / minimal theming with Kaizen-green accent (optional)
