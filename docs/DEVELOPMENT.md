# Development Guide

## Tech Stack

### Backend
- **Runtime**: Node.js 18+ with Express
- **Language**: TypeScript
- **Database**: SQLite (better-sqlite3) — also supports PostgreSQL, MySQL, MariaDB, MSSQL via Knex.js
- **Authentication**: JWT with bcrypt password hashing
- **Password strength**: zxcvbn (minimum score 2/4 enforced at registration and password change)
- **Email**: Nodemailer with ICS calendar attachments; iMIP (RFC 6047) room booking via IMAP
- **LDAP**: ldapts library
- **SSO**: openid-client (OIDC), @node-saml/node-saml (SAML 2.0)
- **2FA**: otpauth (TOTP), qrcode (QR generation)
- **File Uploads**: multer (firmware binaries, park logos)
- **Encryption**: AES-256-GCM for stored secrets (LDAP/SSO/IMAP credentials)
- **Security**: Helmet headers, express-rate-limit, CORS

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Routing**: React Router v6
- **Date Handling**: date-fns
- **Password strength**: zxcvbn (strength meter UI in invite completion and password change forms)
- **Guided tour**: react-joyride (spotlight onboarding tour, role-tailored step sets, fully i18n'd via `t()`)
- **i18n**: react-i18next — locale files in `frontend/src/locales/` (`en.json`, `da.json`). All UI strings use `t()`. Language stored in `localStorage` via `SettingsContext`.
- **Styling**: CSS with custom properties (no CSS framework)
- **Build**: Create React App (react-scripts)

### Device Firmware
- **Platform**: ESP32 (ESP32-2432S028 / CYD 2.8")
- **Framework**: Arduino via PlatformIO
- **Display**: TFT_eSPI (ILI9341 driver, 320x240)
- **JSON**: ArduinoJson v7
- **WiFi Setup**: WiFiManager (captive portal)

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Install all dependencies (backend + frontend)
npm run install:all

# Or install separately
cd backend && npm install
cd frontend && npm install
```

### Seed Database

```bash
npm run seed
```

This creates a SQLite database with demo data: 3 parks, 7 companies, 12 users, and 10 meeting rooms.

### Start Development Servers

Terminal 1 — Backend:
```bash
npm run start:backend
# Runs on http://localhost:3001
```

Terminal 2 — Frontend:
```bash
npm run start:frontend
# Runs on http://localhost:3000
```

### Email Configuration (Development)

Without SMTP configuration, emails are sent to [Ethereal](https://ethereal.email/) (a fake SMTP service). Check the backend console for preview URLs.

For real email delivery:
```bash
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_SECURE=false
SMTP_FROM="Open Meeting <noreply@yourcompany.com>"
```

---

## Project Structure

```
open-meeting/
├── backend/
│   ├── src/
│   │   ├── config/          # Database configuration (Knex)
│   │   ├── middleware/       # Auth middleware (JWT, roles, 2FA)
│   │   ├── migrations/      # 17 database schema migrations
│   │   ├── models/          # Database models
│   │   │   ├── user.model.ts
│   │   │   ├── park.model.ts
│   │   │   ├── company.model.ts
│   │   │   ├── room.model.ts
│   │   │   ├── booking.model.ts
│   │   │   ├── device.model.ts
│   │   │   ├── firmware.model.ts
│   │   │   ├── settings.model.ts
│   │   │   ├── trusted-device.model.ts
│   │   │   ├── guest-visit.model.ts
│   │   │   ├── ldap-config.model.ts
│   │   │   ├── sso-config.model.ts
│   │   │   ├── calendar-token.model.ts
│   │   │   └── database.ts
│   │   ├── routes/          # API route handlers
│   │   │   ├── auth.routes.ts
│   │   │   ├── twofa.routes.ts
│   │   │   ├── booking.routes.ts
│   │   │   ├── room.routes.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── company.routes.ts
│   │   │   ├── park.routes.ts
│   │   │   ├── device.routes.ts
│   │   │   ├── device-api.routes.ts
│   │   │   ├── firmware.routes.ts
│   │   │   ├── settings.routes.ts
│   │   │   ├── setup.routes.ts
│   │   │   ├── statistics.routes.ts
│   │   │   ├── receptionist.routes.ts
│   │   │   ├── ldap.routes.ts
│   │   │   ├── sso.routes.ts
│   │   │   ├── calendar-token.routes.ts
│   │   │   └── ical.routes.ts
│   │   ├── seeds/           # Demo data seeding
│   │   ├── services/        # Business logic services
│   │   │   ├── email.service.ts
│   │   │   ├── ldap.service.ts
│   │   │   ├── ldap-scheduler.service.ts
│   │   │   ├── sso.service.ts
│   │   │   ├── imap.service.ts
│   │   │   ├── ical-parser.service.ts
│   │   │   ├── ical-feed.service.ts
│   │   │   └── audit.service.ts
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Encryption, 2FA enforcement helpers
│   │   ├── index.ts         # Express server entry point
│   │   └── seed.ts          # Database seeding script
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # BookingModal, Layout, TourGuide, DevRoleWidget
│   │   ├── context/         # AuthContext, TourContext, SettingsContext
│   │   ├── locales/         # i18n translation files (en.json, da.json)
│   │   ├── pages/           # 18 page components
│   │   ├── tour/            # Role-specific guided tour step definitions (i18n'd via t())
│   │   ├── services/        # API client (api.ts)
│   │   ├── types/           # TypeScript types
│   │   ├── i18n.ts          # react-i18next setup
│   │   ├── App.tsx          # Router and app shell
│   │   └── styles.css       # Global styles
│   └── package.json
├── device/                  # ESP32 firmware
│   ├── src/
│   │   ├── main.cpp         # Application logic and state machine
│   │   └── ui_manager.cpp   # Display rendering
│   ├── include/
│   │   ├── config.h         # Pin definitions and constants
│   │   ├── api_client.h     # HTTP API client
│   │   ├── ui_manager.h     # UI function declarations
│   │   └── timezones.h      # 25+ timezone definitions
│   └── platformio.ini       # Build configuration
├── docker/
│   ├── nginx.conf           # Reverse proxy (combined container)
│   └── supervisord.conf     # Process manager
├── docs/
│   ├── API.md               # REST API reference
│   └── DEVELOPMENT.md       # This file
├── Dockerfile               # Multi-stage production build
├── docker-compose.yml       # Production deployment
├── docker-compose.dev.yml   # Development services + optional Keycloak
└── package.json             # Root scripts
```

---

## Docker Development

```bash
# Separate backend + frontend containers
docker-compose -f docker-compose.dev.yml up -d

# With Keycloak for SSO testing
docker-compose -f docker-compose.dev.yml --profile sso-test up -d
```

### Building the Production Image

```bash
docker build -t open-meeting .
docker run -d -p 80:80 --name open-meeting open-meeting
```

The production image uses a 3-stage build: backend compilation, frontend build, then a minimal Alpine image with nginx + Node.js managed by supervisord.

---

## Database Migrations

Migrations are in `backend/src/migrations/` and run automatically on startup. Currently 28 migration files (two share the `020` prefix):

1. `001_initial_schema` — Core tables (users, parks, companies, rooms, bookings, devices, firmware)
2. `002_two_factor_auth` — 2FA fields and trusted devices table
3. `003_secretariat_external_guests` — External guest fields on bookings
4. `004_receptionist_guest_visits` — Guest visit tracking table
5. `005_ldap_integration` — LDAP configuration table
6. `006_sso_integration` — SSO configuration table
7. `007_user_invite_tokens` — User invitation token system
8. `008_audit_logs` — Structured audit log table
9. `009_soft_delete_users` — Soft-delete / PII anonymization for deleted users
10. `010_room_email_and_imap_tables` — Per-room booking email address and IMAP tables
11. `011_settings_timezone` — Global settings with timezone support
12. `012_room_imap_credentials` — Per-room IMAP credentials for email-based booking (AES-256-GCM encrypted)
13. `013_room_smtp_fields` — Per-room SMTP override fields for sending iMIP replies
14. `014_security_indexes` — Security-focused database indexes
15. `015_settings_time_format` — Time format setting (12h/24h)
16. `016_calendar_tokens` — Calendar token table for personal iCal feed subscriptions; `calendar_feed_enabled` flags on parks and rooms
17. `017_add_missing_indexes` — FK indexes on `email_uid_map.booking_id`, `email_uid_map.room_id`, and `calendar_tokens.room_id`
18. `018_system_banner` — System banner fields on `settings` table (`banner_enabled`, `banner_message`, `banner_level`, `banner_starts_at`, `banner_ends_at`)
19. `019_user_tour` — `has_seen_tour` boolean on `users` table (defaults `true` for existing users; `false` for new invites so the tour auto-starts on first login)
20. `020_company_setup_pending` — `setup_pending` flag on `companies` (marks auto-created companies that still need initial configuration)
20. `020_hot_desks` — Hot desk tables: `desks`, `desk_bookings`; desk quota fields on `desks`
21. `021_desk_quota_overrides` — Stub (superseded before commit; exists for migration history compatibility)
22. `022_park_desk_quota` — Park-level desk quota defaults (`desk_quota_type`, `monthly_desk_quota`); `user_desk_quotas` table
23. `023_company_desk_access` — `desk_booking_enabled` flag on `companies`
24. `024_desk_features` — `features` JSON column on `desks` (e.g. standing desk, dual monitor)
25. `025_park_blocked_weekdays` — `blocked_weekdays` JSON array on `parks` (0–6, days unavailable for booking)
26. `026_park_week_start_day` — `week_start_day` on `parks` (0=Sunday, 1=Monday default)
27. `027_user_disable` — `disabled_until` and `disable_reason` on `users` for temporary suspension

Each migration uses `hasTable`/`hasColumn` guards and is safe to run on an existing database.
