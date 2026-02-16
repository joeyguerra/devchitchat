# hubot-chat-p2p

A small, local-first, peer-to-peer chat built on Hubot. The Node process is a Hubot instance and acts as the control plane and message store, while media is intended to be WebRTC P2P.

Status: PASS 2 in progress. This build includes WebRTC signaling and a minimal browser client for calls and screen sharing.

## Requirements

- Node.js 22+ (uses `node:sqlite`)

## Quickstart

1. Install dependencies

```
npm install
```

2. Start server

```
npm start
```

On first start, the server logs a bootstrap token for the initial admin if no users exist. Use that token in the login form to create the admin user.

3. Open two browser tabs

- Sign in with the bootstrap token in the first tab
- Create a room and start a call
- In the second tab, redeem a new invite, join the room, then join the call
- Use "Start mic/cam" and "Share screen" to publish streams

3. Run tests

```
npm test
```

## Configuration

- `PORT` (default 3000)
- `DB_PATH` (default `./data/chat.db`)
- `SESSION_TTL_MS` (default 30 days)
- `BOOTSTRAP_TOKEN` (optional, sets the first-admin token instead of auto-generating)
- `STUN_URLS` (comma separated STUN urls)
- `TURN_URLS` (comma separated TURN urls)
- `TURN_USERNAME`
- `TURN_CREDENTIAL`
- `HTTPS_CERT_FILE` (optional; enables HTTPS when set with key file)
- `HTTPS_KEY_FILE` (optional; enables HTTPS when set with cert file)

## HTTPS on LAN (self-signed)

To run on `https://joey-mini.local:3000`, generate a cert whose SAN includes that IP:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
  -keyout certs/dev-key.pem \
  -out certs/dev-cert.pem \
  -subj "/CN=joey-mini.local" \
  -addext "subjectAltName = IP:192.168.222.222"
```

Start server with TLS:

```bash
HTTPS_CERT_FILE=./certs/dev-cert.pem HTTPS_KEY_FILE=./certs/dev-key.pem npm start
```

Notes:
- Chrome on Windows will still warn until you trust the self-signed cert.
- Import `dev-cert.pem` into `Trusted Root Certification Authorities` on the Windows machine running Chrome.

## Why signaling is centralized

WebRTC peers must exchange SDP and ICE candidates to connect. A shared rendezvous point is required so peers can find each other and exchange these messages securely. The Hubot process provides that signaling while keeping media peer-to-peer.

## When TURN is needed

If peers cannot connect due to NAT or firewall restrictions, TURN relays are required. v0 supports passing TURN credentials to clients, but does not bundle a TURN server to keep dependencies minimal.

## Why SFU is out of scope for v0

An SFU centralizes media forwarding and adds complexity and resource cost. For a small group, a mesh is acceptable and aligns with the decentralized and simple design goals.

## Next features

- Invite UI + QR codes for LAN onboarding
- End-to-end encryption for text (room keys)
- Multi-device pairing and local-first sync
- Message retention controls and purge tools
- Moderation audit log and diagnostics page
- Backup and restore for SQLite + attachments
- P2P file attachments with server fallback
- Presence enhancements and push-to-talk

## If streaming isn't working for local dev, create a cert and serve up the site with https

```sh
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 -keyout certs/dev-key.pem -out certs/dev-cert.pem -subj "/CN=joey-mini.local"
```

```sh
HTTPS_CERT_FILE=./certs/dev-cert.pem HTTPS_KEY_FILE=./certs/dev-key.pem npm start
```


