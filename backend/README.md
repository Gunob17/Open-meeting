# Backend

Express + TypeScript API server for Open Meeting.

## Quick Start

```bash
npm install
npm run dev    # Development with hot reload
npm run build  # Compile TypeScript
npm start      # Run compiled output
```

## Architecture

### Models (`src/models/`)

Each model provides static methods for CRUD operations using the database layer.

| Model | Table | Description |
|-------|-------|-------------|
| `user.model` | `users` | Users with roles, 2FA, LDAP/SSO linking |
| `park.model` | `parks` | Multi-site locations with logos and reception config |
| `company.model` | `companies` | Tenant companies within parks |
| `room.model` | `meeting_rooms` | Rooms with amenities, hours, and company locks |
| `booking.model` | `bookings` | Bookings with attendees and external guests |
| `device.model` | `devices` | ESP32 display devices with token auth |
| `firmware.model` | `firmware` | Firmware versions with file storage |
| `settings.model` | `settings` | Global settings (hours, 2FA enforcement, system banner) |
| `trusted-device.model` | `trusted_devices` | 2FA trusted browser tokens |
| `guest-visit.model` | `guest_visits` | Guest check-in/check-out records |
| `ldap-config.model` | `ldap_configs` | Per-company LDAP configuration |
| `sso-config.model` | `sso_configs` | Per-company SSO configuration |
| `calendar-token.model` | `calendar_tokens` | iCal feed subscription tokens (scoped to user or room) |

### Routes (`src/routes/`)

| File | Mount Point | Purpose |
|------|-------------|---------|
| `auth.routes` | `/api/auth` | Login, session, password change, invite completion, guided tour state |
| `twofa.routes` | `/api/auth/2fa` | 2FA setup, verify, trusted devices |
| `booking.routes` | `/api/bookings` | CRUD bookings, cancel, move, delete |
| `room.routes` | `/api/rooms` | CRUD rooms, availability check (park-scoped access enforcement) |
| `user.routes` | `/api/users` | CRUD users, 2FA reset |
| `company.routes` | `/api/companies` | CRUD companies; company-scoped 2FA enforcement |
| `park.routes` | `/api/parks` | CRUD parks, logo upload; park-scoped 2FA enforcement |
| `device.routes` | `/api/devices` | Device management, firmware scheduling |
| `device-api.routes` | `/api/device` | Device-to-server API (token auth) |
| `firmware.routes` | `/api/firmware` | Firmware upload and management |
| `settings.routes` | `/api/settings` | Global settings, 2FA config, system announcement banner |
| `setup.routes` | `/api/setup` | Initial setup wizard |
| `statistics.routes` | `/api/statistics` | Analytics and reporting |
| `receptionist.routes` | `/api/receptionist` | Guest check-in/check-out |
| `ldap.routes` | `/api/ldap` | LDAP config, test, sync |
| `sso.routes` | `/api/sso` | SSO config, login flow, callbacks |
| `calendar-token.routes` | `/api/calendar-tokens` | iCal feed token CRUD |
| `ical.routes` | `/api/ical` | Public iCal feed endpoints (token-authenticated, no JWT) |

### Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `email.service` | Send meeting invites (ICS), cancellations, admin notices, reception alerts; iMIP ACCEPT/DECLINE replies |
| `ldap.service` | LDAP authentication, user sync, group role mapping |
| `ldap-scheduler.service` | Automatic periodic LDAP sync |
| `sso.service` | OIDC/SAML login flows, user provisioning, state management |
| `imap.service` | Per-room IMAP workers (`ImapWorkerManager`) — poll inboxes, parse iMIP invites, create/update bookings |
| `ical-parser.service` | Parse iCal payloads from emails; returns `ParsedMeetingRequest` with UID/SEQUENCE |
| `ical-feed.service` | Generate iCal `.ics` feeds for personal bookings or room schedules |
| `audit.service` | Fire-and-forget `auditLog()` — writes structured events to `audit_logs` table |

### Middleware (`src/middleware/`)

`auth.middleware.ts` provides:
- `authenticate` — Verify full JWT token, check user active status
- `authenticatePartial` — Accept 2FA-pending tokens (for verification endpoints)
- `requireRole(...roles)` — Role-based access control
- `requireSuperAdmin`, `requireParkAdmin`, `requireCompanyAdminOrAbove` — Role shortcuts
- `requireAddonRole(role)` — Check addon roles (e.g., receptionist)
- `generateToken` / `generatePartialToken` — JWT creation

### Utils (`src/utils/`)

| Utility | Purpose |
|---------|---------|
| `encryption.ts` | AES-256-GCM encrypt/decrypt for stored secrets (LDAP/SSO/IMAP credentials) |
| `twofa-enforcement.ts` | Resolve effective 2FA enforcement (system > park > company cascade) |

### Migrations (`src/migrations/`)

19 migration files run automatically on startup. See [DEVELOPMENT.md](../docs/DEVELOPMENT.md#database-migrations) for the full list.

### Security Notes

- **Password strength**: `zxcvbn` is applied in the `complete-invite` and `change-password` handlers; passwords scoring below 2/4 ("fair") are rejected.
- **Rate limiting**: 20 req/15 min on all auth endpoints; 5 req/min specifically on `POST /auth/complete-invite`.
- **Room access (IDOR prevention)**: `GET /rooms/:id` and `GET /rooms/:id/availability` enforce park-scoped access — users cannot fetch rooms from other parks.
- **Audit logging**: Every state-changing route calls `auditLog()` via `audit.service.ts`. See `AuditAction` in that file for the full list of tracked actions.
- **Production secrets**: `docker-compose.prod.yml` uses Docker's `:?` syntax — startup fails if `JWT_SECRET`, `DB_ROOT_PASSWORD`, or `DB_PASSWORD` are unset.

### Auth Flow

1. **Login**: Email + password → validate → check 2FA requirement
2. **If 2FA required**: Return partial token (5 min expiry) → client shows 2FA prompt
3. **2FA verify**: Partial token + TOTP code → return full token
4. **Trusted device**: If mode=trusted_device and valid device token present, skip 2FA
5. **LDAP login**: Search user by email → bind with password → create/update local user
6. **SSO login**: Redirect to IdP → callback with code/assertion → find/create user → return token

### User Roles

| Role | Scope | Key Permissions |
|------|-------|----------------|
| `super_admin` | All parks | Everything, system settings, park management |
| `park_admin` | Own park | Rooms, devices, companies, users, statistics |
| `company_admin` | Own company | Users, LDAP, SSO for their company |
| `user` | Own park | Book rooms, manage own bookings |

Addon roles (e.g., `receptionist`) are stored in `addonRoles` JSON array and checked via `requireAddonRole()`.
