# Development Guide

## Tech Stack

### Backend
- **Runtime**: Node.js 18+ with Express
- **Language**: TypeScript
- **Database**: SQLite (better-sqlite3) — also supports PostgreSQL, MySQL, MariaDB, MSSQL via Knex.js
- **Authentication**: JWT with bcrypt password hashing
- **Email**: Nodemailer with ICS calendar attachments
- **LDAP**: ldapts library
- **SSO**: openid-client (OIDC), @node-saml/node-saml (SAML 2.0)
- **2FA**: otpauth (TOTP), qrcode (QR generation)
- **File Uploads**: multer (firmware binaries, park logos)
- **Encryption**: AES-256-GCM for stored secrets (LDAP passwords, SSO client secrets)
- **Security**: Helmet headers, express-rate-limit, CORS

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Routing**: React Router v6
- **Date Handling**: date-fns
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
│   │   ├── migrations/      # 6 database schema migrations
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
│   │   │   └── sso.routes.ts
│   │   ├── seeds/           # Demo data seeding
│   │   ├── services/        # Business logic services
│   │   │   ├── email.service.ts
│   │   │   ├── ldap.service.ts
│   │   │   ├── ldap-scheduler.service.ts
│   │   │   └── sso.service.ts
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Encryption, 2FA enforcement helpers
│   │   ├── index.ts         # Express server entry point
│   │   └── seed.ts          # Database seeding script
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # BookingModal, Layout
│   │   ├── context/         # AuthContext
│   │   ├── pages/           # 17 page components
│   │   ├── services/        # API client (api.ts)
│   │   ├── types/           # TypeScript types
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

Migrations are in `backend/src/migrations/` and run automatically on startup:

1. `001_initial_schema` — Core tables (users, parks, companies, rooms, bookings, devices, firmware)
2. `002_two_factor_auth` — 2FA fields and trusted devices table
3. `003_secretariat_external_guests` — External guest fields on bookings
4. `004_receptionist_guest_visits` — Guest visit tracking table
5. `005_ldap_integration` — LDAP configuration table
6. `006_sso_integration` — SSO configuration table
