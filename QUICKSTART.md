# Quick Start Guide

## Installation

The authentication system is already installed and configured. No additional dependencies are required beyond `cookie-parser`.

## First Run

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Initialize Admin Account:**
   - Navigate to `http://localhost:8080/auth/setup`
   - Fill in the admin account details:
     - Email address
     - Nickname (3-20 alphanumeric characters, hyphens, underscores)
     - Password (min 8 chars with uppercase, lowercase, number, special char)
   - Click "Create Admin Account"

3. **Log in:**
   - You'll be redirected to `/auth/login`
   - Enter your email/nickname and password
   - Click "Login"

## Managing Users

### Create an Invitation

1. Log in as admin
2. Navigate to `http://localhost:8080/auth/admin`
3. In the "Create Invitation" section:
   - Enter the user's email address
   - Set expiration time (default 72 hours)
   - Click "Create Invitation"
4. Copy the invitation URL and send it to the user

### Register with Invitation

Users receive an invitation link like:
```
http://localhost:8080/auth/register?token=abc123...
```

They click it and:
1. Email is pre-filled (read-only)
2. Choose a nickname (3-20 chars, alphanumeric, hyphens, underscores)
3. Create a password (min 8 chars with uppercase, lowercase, number, special)
4. Click "Create Account"

### Reset User Password (Admin)

1. Log in as admin
2. Navigate to `/auth/admin`
3. In the "Reset User Password" section:
   - Select the user from dropdown
   - Enter new password
   - Click "Reset Password"

### Change Your Own Password

Via Web:
1. Make a POST request to `/auth/change-password` with:
   ```json
   {
     "currentPassword": "your-current-password",
     "newPassword": "your-new-password"
   }
   ```

Via Chat:
- This can be implemented as a chat command if needed

## Integrating with WebSocket Chat

When a user successfully logs in via the web interface, they receive a session cookie. To connect to the WebSocket chat:

1. **Client-side JavaScript** should first call `/api/auth/check`:
   ```javascript
   const response = await fetch('/api/auth/check')
   const data = await response.json()
   
   if (data.authenticated) {
     // Connect to WebSocket with user info
     const ws = new WebSocket('ws://localhost:8080/chat')
     // Send authentication info
     ws.send(JSON.stringify({
       type: 'auth',
       sessionId: data.sessionId,
       nickname: data.user.nickname
     }))
   }
   ```

2. **Server-side** the SqlAuth.mjs script validates the session and connects it to the WebSocket session.

## Scripts

The authentication system consists of these Hubot scripts:

1. **AuthRoutes.mjs** - Sets up Express routes for web authentication
2. **SqlAuth.mjs** - Validates WebSocket connections against authenticated users
3. **RoleBasedAccess.mjs** - Enforces role-based permissions
4. **RateLimiting.mjs** - Implements role-based rate limiting
5. **WebSocketAuth.mjs** - Bridges web sessions to WebSocket connections

## API Endpoints

### Public
- `GET /auth/init` - Check if system needs initialization
- `POST /auth/init` - Create admin account
- `GET /auth/login` - Login page
- `POST /auth/login` - Authenticate user
- `GET /auth/register?token=<token>` - Registration page
- `POST /auth/register` - Register with invitation

### Authenticated
- `GET /auth/status` - Get current user info
- `POST /auth/logout` - Log out
- `POST /auth/change-password` - Change own password

### Admin Only
- `GET /auth/admin` - Admin dashboard
- `POST /auth/invitations` - Create invitation
- `GET /auth/users` - List all users
- `POST /auth/reset-password` - Reset user password
- `GET /auth/audit-logs` - View security audit logs

## Chat Commands

- `@hubot auth status` - Check your authentication status
- `@hubot what is my role` - Check your role
- `@hubot rate limit status` - Check your rate limit
- `@hubot list users` *(admin)* - List all users
- `@hubot role of <nickname>` *(admin)* - Check a user's role

## Security Features

✅ PBKDF2 password hashing (100,000 iterations, SHA-512)
✅ Timing-safe password comparison
✅ HTTP-only session cookies
✅ Session expiration (24 hours)
✅ One-time invitation tokens
✅ Invitation expiration (configurable, default 72 hours)
✅ Password complexity requirements
✅ Audit logging of all security events
✅ Role-based access control
✅ Role-based rate limiting

## Testing

Run the comprehensive test suite:
```bash
npm test
```

All 26 tests should pass, covering:
- Database operations
- Password hashing and verification
- User authentication
- Invitation system
- Session management
- Password resets
- Audit logging

## Production Deployment

For production:

1. Set `NODE_ENV=production` to enable secure HTTPS-only cookies
2. Use HTTPS (required for secure cookies)
3. Regularly backup `data/auth.db`
4. Monitor `/auth/audit-logs` for security events
5. Consider implementing email notifications for invitations
6. Set up automated session cleanup (already runs hourly)

## Troubleshooting

**Cannot create admin account:**
- Ensure no admin exists (check `/auth/init` endpoint)
- Delete `data/auth.db` and restart if needed

**Session expired:**
- Sessions last 24 hours
- User needs to log in again

**Invitation invalid:**
- Invitations expire after configured time (default 72 hours)
- Invitations can only be used once
- Create a new invitation for the user

**Database locked:**
- Only one server instance should run at a time
- Check for zombie processes

## File Locations

- **Database:** `data/auth.db` (auto-created)
- **Configuration:** Scripts in `scripts/` directory
- **Source code:** Core logic in `src/` directory
- **Tests:** `tests/AuthTest.test.mjs`

## Support

For detailed information, see:
- `AUTH_README.md` - Comprehensive documentation
- `src/database.mjs` - Database schema and operations
- `src/auth-service.mjs` - Authentication business logic
- `src/auth-routes.mjs` - Web routes and HTML templates
