# Authentication & Authorization System

## Overview

This is a comprehensive SQLite-backed authentication and authorization system for DevChitChat. It implements secure user management with invitation-based registration, role-based access control, and rate limiting.

## Features

### 🔐 Security Best Practices
- **PBKDF2 Password Hashing**: 100,000 iterations with SHA-512
- **Timing-Safe Password Comparison**: Prevents timing attacks
- **HTTP-Only Session Cookies**: Prevents XSS attacks
- **Secure Session Management**: 24-hour session expiration
- **Audit Logging**: All authentication events are logged
- **Password Requirements**: Minimum 8 characters with uppercase, lowercase, number, and special character

### 👥 User Management
- **Admin Initialization**: First-run setup creates admin account
- **Invitation-Based Registration**: Admin-only invitation system with temporal, one-time-use links
- **Role-Based Access**: Admin and user roles with different permissions
- **Password Resets**: Admin can reset any user's password
- **Self-Service Password Change**: Users can change their own passwords

### 🔑 Authentication Flow
1. System checks if admin exists on startup
2. If no admin, redirect to `/auth/setup` for initialization
3. Admin creates invitations for new users
4. Users register via invitation link
5. Users log in with email/nickname and password
6. Session is maintained via HTTP-only cookie

### 🛡️ Authorization Features
- **Role-Based Access Control**: Different permissions for admin vs. user
- **Rate Limiting**: Different limits based on user role
  - Admin: 100 messages/min, no room creation cooldown
  - User: 20 messages/min, 5-minute room creation cooldown
  - Guest: 5 messages/min (authenticated users only can actually send)
- **Room Restrictions**: Only admins can create private rooms
- **Audit Trail**: All security events are logged

## File Structure

```
src/
├── database.mjs           # SQLite database layer with crypto functions
├── auth-service.mjs       # Authentication service with validation
├── auth-routes.mjs        # Express routes and HTML page templates
scripts/
├── AuthRoutes.mjs         # Hubot script to mount auth routes
├── SqlAuth.mjs            # Hubot adapter authentication hook
├── RoleBasedAccess.mjs    # Authorization and role management
├── RateLimiting.mjs       # Rate limiting with role-based rules
data/
└── auth.db               # SQLite database (auto-created)
```

## Database Schema

### Tables
- **users**: User accounts with hashed passwords
- **invitations**: Invitation tokens with expiration
- **sessions**: Active user sessions
- **password_reset_tokens**: Password reset tokens (for admin resets)
- **audit_log**: Security event logging

## API Endpoints

### Public Endpoints
- `GET /auth/init` - Check if system needs initialization
- `POST /auth/init` - Create admin account
- `GET /auth/login` - Login page
- `POST /auth/login` - Authenticate user
- `GET /auth/register?token=<token>` - Registration page
- `POST /auth/register` - Register with invitation

### Authenticated Endpoints
- `GET /auth/status` - Get current user info
- `POST /auth/logout` - Log out current user
- `POST /auth/change-password` - Change own password

### Admin-Only Endpoints
- `GET /auth/admin` - Admin dashboard
- `POST /auth/invitations` - Create invitation
- `GET /auth/users` - List all users
- `POST /auth/reset-password` - Reset user password
- `GET /auth/audit-logs` - View audit logs

## Setup Instructions

### 1. Start the Server
```bash
npm start
```

### 2. Initialize Admin Account
On first run, navigate to `http://localhost:8080/auth/setup` and create the admin account.

### 3. Create Invitations
1. Log in as admin
2. Navigate to `/auth/admin`
3. Enter email address and create invitation
4. Copy the invitation URL and send to the user
5. User clicks link and creates their account

### 4. User Registration
Users receive invitation link, click it, and fill out:
- Nickname (3-20 alphanumeric characters)
- Password (min 8 chars, must include uppercase, lowercase, number, special char)

### 5. Login
Users can log in at `/auth/login` with:
- Email or nickname
- Password

## Integration with Hubot Chat Adapter

The authentication system integrates with the `@hubot-friends/hubot-chat` adapter using authentication and authorization hooks:

### SqlAuth.mjs
- Validates users have authenticated via web login
- Maintains mapping of WebSocket session IDs to user accounts
- Provides `robot.authDb` and `robot.authenticatedSessions` to other scripts

### RoleBasedAccess.mjs
- Enforces role-based permissions on chat actions
- Restricts room creation to authenticated users
- Allows only admins to create private rooms
- Provides chat commands: `@hubot what is my role`, `@hubot list users`

### RateLimiting.mjs
- Implements role-based rate limiting
- Different limits for admin, user, and guest roles
- Prevents spam and abuse
- Command: `@hubot rate limit status`

## Environment Variables

No environment variables are required for basic operation. Optionally:

- `NODE_ENV=production` - Enables secure cookies (HTTPS only)

## Security Considerations

### ✅ Implemented
- Strong password hashing (PBKDF2 with 100k iterations)
- Timing-safe password comparison
- Session expiration (24 hours)
- HTTP-only cookies
- Audit logging
- Invitation expiration (72 hours default)
- One-time-use invitation tokens
- Password complexity requirements

### 🔒 Production Recommendations
1. **Enable HTTPS**: Set `NODE_ENV=production` and use HTTPS
2. **Secure Cookie Storage**: Cookies are already HTTP-only
3. **Regular Backups**: Back up `data/auth.db` regularly
4. **Monitor Audit Logs**: Check `/auth/audit-logs` for suspicious activity
5. **Rotate Sessions**: Current 24-hour expiration is reasonable
6. **Rate Limiting**: Already implemented with role-based limits

## Troubleshooting

### Database Locked Error
If you see "database is locked" errors, ensure only one instance of the application is running.

### Session Not Found
Sessions expire after 24 hours or if the database is reset. Users need to log in again.

### Invalid Invitation
Invitations expire after 72 hours (configurable) and can only be used once.

### Admin Password Reset
Only admins can reset passwords. If admin loses access:
1. Stop the server
2. Delete `data/auth.db`
3. Restart and create a new admin account

## Chat Commands

When authenticated in chat:

- `@hubot auth status` - Check your authentication status
- `@hubot what is my role` - Check your role
- `@hubot rate limit status` - Check your rate limit status
- `@hubot list users` *(admin only)* - List all users
- `@hubot role of <nickname>` *(admin only)* - Check another user's role

## Development Notes

### Using Native Node.js SQLite
This implementation uses Node.js's built-in `node:sqlite` module (DatabaseSync) which is:
- Zero external dependencies for SQLite
- Synchronous API (simpler code)
- Built-in to Node.js v22.5.0+

### Password Hashing
Uses Node.js built-in `crypto` module:
- `pbkdf2Sync` for password hashing
- `randomBytes` for salt and token generation
- `timingSafeEqual` for timing-safe password comparison

### No External Dependencies Required
Core authentication uses only Node.js built-in modules:
- `node:sqlite` - Database
- `node:crypto` - Cryptography
- `node:path` - File paths
- `node:url` - URL utilities

The only external dependency is `cookie-parser` for parsing cookies in Express.

## License

MIT
