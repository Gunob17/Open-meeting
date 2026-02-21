# Open Meeting

A comprehensive meeting room booking service for shared offices and parks with multi-tenant support, hierarchical user structure, enterprise authentication, and IoT device integration.

## Features

### Multi-Park Architecture
- **Super Admin**: Manages multiple parks, creates park admins, configures system-wide settings
- **Park Admin**: Manages rooms, companies, devices, and users within their park
- **Company Admin**: Manages users, LDAP, and SSO for their company
- **User**: Books meeting rooms within their park
- **Receptionist** (addon role): Manages guest check-in/check-out

### Core Features
- **Calendar View**: Weekly view showing all meeting rooms and their booking status with color-coded availability
- **Room List View**: Browse rooms with capacity, amenities, and real-time availability status
- **Booking System**: Book rooms with conflict detection, partial slot booking, and attendee management
- **Admin Booking Actions**: Admins can move bookings to different rooms or delete bookings with reason notifications
- **Email Notifications**: Meeting invites with ICS calendar attachments, cancellation notices, admin action notifications, and reception guest alerts
- **Park Isolation**: Users can only see and book rooms within their assigned park

### Room Management
- Capacity (number of occupants)
- Amenities (projector, whiteboard, video conferencing, speakerphone, etc.)
- Floor and address information
- Room-specific or global booking hours
- Configurable quick booking durations per room
- **Multi-company room locking**: Restrict rooms to specific companies, hidden from unauthorized users

### Two-Factor Authentication (2FA)
- TOTP-based 2FA with QR code setup
- Backup codes for account recovery (8 one-time codes)
- Trusted device management — skip 2FA on remembered devices
- Hierarchical enforcement: System > Park > Company (disabled / optional / required)
- Two verification modes: every login or trusted device with configurable expiration

### LDAP Integration
- Per-company LDAP directory configuration
- Automatic user synchronization with configurable scheduling
- Group-based role mapping (LDAP groups to app roles)
- Connection testing and sync status tracking
- TLS/StartTLS support with certificate validation options
- Encrypted credential storage (AES-256-GCM)

### Single Sign-On (SSO)
- **OIDC** (OpenID Connect): Keycloak, Azure AD, Okta, Google, and more
- **SAML 2.0**: ADFS, Shibboleth, OneLogin, and more
- Email-domain-based auto-discovery at login
- Just-in-time (JIT) user provisioning on first SSO login
- Per-company configuration with email domain whitelisting

### Guest Management & Reception
- Add external guests to bookings with configurable fields (name, email, company)
- Receptionist dashboard for daily guest check-in/check-out
- Guest status tracking: pending, checked in, checked out
- Overstay detection (past booking end time or room closing hour)
- Automatic reception email notifications with guest details
- Configurable guest information fields per park

### Statistics & Analytics
- Room utilization metrics with percentage tracking
- Hourly and daily booking distribution charts
- Amenity popularity ranking
- Top bookers identification
- Underutilized room detection (below 30% utilization)
- Date range filtering with summary cards

### Device Support (ESP32 IoT)
- ESP32-based room display devices (CYD 2.8" TFT with touch)
- Real-time room status display with RGB LED indicators (green = available, red = occupied)
- Quick booking from the device touchscreen with configurable durations
- WiFi captive portal setup with web-based configuration
- Timezone-aware time display with 25+ timezone support
- Screen timeout and auto-reconnection with boot loop protection
- **OTA Firmware Updates**: Upload firmware versions, schedule batch updates to multiple devices, automatic update checking, device health monitoring (last-seen, firmware version)

## Tech Stack

### Backend
- Node.js with Express
- TypeScript
- SQLite (better-sqlite3) with PostgreSQL/MySQL/MSSQL support
- JWT authentication with role-based access control
- Nodemailer for emails with ICS calendar attachments
- `ldapts` for LDAP integration
- `openid-client` for OIDC SSO
- `@node-saml/node-saml` for SAML 2.0 SSO
- `otpauth` and `qrcode` for 2FA
- `multer` for file uploads (firmware, logos)
- AES-256-GCM encryption for stored secrets

### Frontend
- React 18
- TypeScript
- React Router v6
- date-fns for date handling
- Responsive design with mobile sidebar navigation

### Device Firmware
- PlatformIO with Arduino framework
- TFT_eSPI display library
- ArduinoJson for API communication
- WiFiManager for captive portal setup

## Getting Started

### Option 1: Docker (Recommended)

The easiest way to run the application is with Docker. Download the latest release from [GitHub Releases](../../releases):

```bash
# Download the image tar file from releases, then load it
gunzip -c open-meeting-v1.0.0.tar.gz | docker load

# Run the container
docker run -d -p 80:80 --name open-meeting open-meeting:v1.0.0

# Or use Docker Compose (after building locally)
docker-compose up -d
```

The application will be available at `http://localhost`.

### Option 2: Local Development

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Installation

1. Install dependencies:
```bash
# Install all dependencies
npm run install:all

# Or install separately
npm run install:backend
npm run install:frontend
```

2. Seed the database with sample data:
```bash
npm run seed
```

3. Start the backend server:
```bash
npm run start:backend
```

4. In a new terminal, start the frontend:
```bash
npm run start:frontend
```

The backend will run on `http://localhost:3001` and frontend on `http://localhost:3000`.

## Demo Accounts

After running demo setup, you can log in with these accounts:

### Primary Demo Accounts

| Role | Email | Password | Description |
|------|-------|----------|-------------|
| Super Admin | admin@openmeeting.com | admin123 | Can manage all parks |
| Park Admin | parkadmin@downtown.com | parkadmin123 | Downtown Business Park admin |
| Company Admin | admin@techcorp.com | techcorp123 | TechCorp company admin |
| User | john@techcorp.com | john123 | Regular user |

### Additional Demo Accounts by Park

**Downtown Business Park:**
- Park Admin: parkadmin@downtown.com / parkadmin123
- Company Admin: admin@techcorp.com / techcorp123
- Users: john@techcorp.com, jane@techcorp.com, bob@startuphub.com

**Tech Innovation Hub:**
- Park Admin: parkadmin@techhub.com / techhub123
- Company Admin: sarah@innovatetech.com / sarah123
- User: mike@aidynamics.com / mike123

**Creative Arts Center:**
- Park Admin: parkadmin@creative.com / creative123
- Company Admin: alex@pixelperfect.com / alex123
- User: emma@brightmedia.com / emma123

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login (supports local, LDAP, and trusted device bypass)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/change-password` - Change password

### Two-Factor Authentication
- `POST /api/auth/2fa/setup` - Generate 2FA secret and QR code
- `POST /api/auth/2fa/setup/confirm` - Confirm 2FA setup with TOTP code
- `POST /api/auth/2fa/verify` - Verify 2FA code or backup code
- `POST /api/auth/2fa/disable` - Disable 2FA (requires password)
- `GET /api/auth/2fa/status` - Get 2FA status
- `GET /api/auth/2fa/trusted-devices` - List trusted devices
- `DELETE /api/auth/2fa/trusted-devices/:id` - Revoke trusted device

### Parks (Super Admin)
- `GET /api/parks` - List all parks
- `POST /api/parks` - Create park
- `PUT /api/parks/:id` - Update park
- `DELETE /api/parks/:id` - Delete park
- `POST /api/parks/:id/logo` - Upload park logo
- `DELETE /api/parks/:id/logo` - Remove park logo

### Companies (Park Admin+)
- `GET /api/companies` - List companies in park
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

### Users (Company Admin+)
- `GET /api/users` - List users (filtered by park)
- `GET /api/users/company/:companyId` - List company users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `POST /api/users/:id/reset-2fa` - Reset user's 2FA (admin)
- `DELETE /api/users/:id` - Delete user

### Meeting Rooms (Park Admin+)
- `GET /api/rooms` - List rooms (filtered by park, respects company locks)
- `GET /api/rooms/:id` - Get room details
- `GET /api/rooms/:id/availability` - Check room availability
- `POST /api/rooms` - Create room
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room

### Bookings
- `GET /api/bookings` - List all bookings (with optional date range)
- `GET /api/bookings/my` - List current user's bookings
- `GET /api/bookings/:id` - Get booking details
- `POST /api/bookings` - Create booking
- `PUT /api/bookings/:id` - Update booking
- `POST /api/bookings/:id/cancel` - Cancel booking
- `POST /api/bookings/:id/move` - Move booking to different room (admin)
- `DELETE /api/bookings/:id` - Delete booking (admin)

### Settings (Park Admin+)
- `GET /api/settings` - Get global settings
- `PUT /api/settings` - Update booking hours
- `PUT /api/settings/2fa` - Update 2FA settings (Super Admin)

### Device Management (Park Admin+)
- `GET /api/devices` - List all devices
- `POST /api/devices` - Create device
- `PUT /api/devices/:id` - Update device
- `POST /api/devices/:id/regenerate-token` - Regenerate device token
- `DELETE /api/devices/:id` - Delete device
- `POST /api/devices/firmware/schedule-update` - Batch schedule firmware update
- `POST /api/devices/:id/firmware/cancel-update` - Cancel pending update

### Device API (device token auth)
- `GET /api/device/status` - Get room status and bookings
- `POST /api/device/quick-book` - Quick book room from device
- `GET /api/device/ping` - Health check
- `GET /api/device/info` - Get device and room info
- `POST /api/device/firmware/report` - Report firmware version
- `GET /api/device/firmware/check` - Check for firmware updates
- `GET /api/device/firmware/download/:version` - Download firmware binary

### Firmware (Park Admin+)
- `GET /api/firmware` - List all firmware versions
- `GET /api/firmware/latest` - Get latest firmware
- `POST /api/firmware` - Upload firmware (multipart)
- `DELETE /api/firmware/:id` - Delete firmware
- `PATCH /api/firmware/:id/active` - Toggle firmware active status

### LDAP (Company Admin+)
- `GET /api/ldap/config/:companyId` - Get LDAP config
- `POST /api/ldap/config` - Create LDAP config
- `PUT /api/ldap/config/:id` - Update LDAP config
- `DELETE /api/ldap/config/:id` - Delete LDAP config
- `POST /api/ldap/config/:id/enable` - Enable LDAP
- `POST /api/ldap/config/:id/disable` - Disable LDAP
- `POST /api/ldap/config/:id/test` - Test LDAP connection
- `POST /api/ldap/config/:id/sync` - Trigger user sync

### SSO (Company Admin+)
- `GET /api/sso/discover?email=` - Discover SSO provider by email domain
- `GET /api/sso/init/:configId` - Initiate SSO login flow
- `GET /api/sso/callback/oidc` - OIDC callback
- `POST /api/sso/callback/saml` - SAML callback
- `GET /api/sso/saml/metadata/:configId` - SAML SP metadata
- `GET /api/sso/config/:companyId` - Get SSO config
- `POST /api/sso/config` - Create SSO config
- `PUT /api/sso/config/:id` - Update SSO config
- `DELETE /api/sso/config/:id` - Delete SSO config

### Receptionist (requires receptionist role)
- `GET /api/receptionist/guests` - List guests for date
- `POST /api/receptionist/guests/:id/checkin` - Check in guest
- `POST /api/receptionist/guests/:id/checkout` - Check out guest
- `POST /api/receptionist/guests/:id/undo-checkin` - Undo check-in

### Statistics (Park Admin+)
- `GET /api/statistics/summary` - Overall summary
- `GET /api/statistics/rooms` - Room utilization stats
- `GET /api/statistics/hourly` - Hourly booking distribution
- `GET /api/statistics/daily` - Daily booking trend
- `GET /api/statistics/amenities` - Amenity popularity
- `GET /api/statistics/top-bookers` - Top bookers list

### Setup
- `GET /api/setup/status` - Check if system is initialized
- `POST /api/setup/demo` - Initialize with demo data
- `POST /api/setup/production` - Initialize for production

## Email Configuration

For production, configure these environment variables:

```bash
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_SECURE=false
SMTP_FROM="Open Meeting <noreply@yourcompany.com>"
```

## Project Structure

```
open-meeting/
├── backend/
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── middleware/     # Authentication & authorization middleware
│   │   ├── migrations/    # Database schema migrations
│   │   ├── models/        # Database models (user, room, booking, device, etc.)
│   │   ├── routes/        # API route handlers
│   │   ├── seeds/         # Demo data seeding
│   │   ├── services/      # Email, LDAP, SSO services
│   │   ├── types/         # TypeScript type definitions
│   │   ├── utils/         # Encryption, 2FA enforcement helpers
│   │   ├── index.ts       # Express server entry point
│   │   └── seed.ts        # Database seeding script
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # BookingModal, Layout
│   │   ├── context/       # AuthContext (authentication state)
│   │   ├── pages/         # 17 page components
│   │   ├── services/      # API client service
│   │   ├── types/         # TypeScript type definitions
│   │   ├── App.tsx        # Router and app shell
│   │   └── styles.css     # Global styles
│   └── package.json
├── device/                # ESP32 IoT display firmware
│   ├── src/               # main.cpp, ui_manager.cpp
│   ├── include/           # Header files (config, API client, UI, timezones)
│   └── platformio.ini     # PlatformIO build configuration
├── docker/                # Docker configuration
│   ├── nginx.conf         # Nginx reverse proxy config
│   └── supervisord.conf   # Process manager config
├── Dockerfile             # Multi-stage production build
├── docker-compose.yml     # Production deployment
├── docker-compose.dev.yml # Development with separate services + optional Keycloak
└── package.json           # Root package.json
```

## Docker

### Build Locally

```bash
# Build the combined image
docker build -t open-meeting .

# Run the container
docker run -d -p 80:80 --name open-meeting open-meeting
```

### Docker Compose

```bash
# Production (combined container)
docker-compose up -d

# Development (separate backend and frontend)
docker-compose -f docker-compose.dev.yml up -d

# Development with Keycloak for SSO testing
docker-compose -f docker-compose.dev.yml --profile sso-test up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | (change in production!) |
| `LDAP_ENCRYPTION_KEY` | Encryption key for LDAP/SSO secrets | Falls back to JWT_SECRET |
| `DB_TYPE` | Database type (sqlite, pg, mysql, mssql) | sqlite |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | - |
| `DB_NAME` | Database name | meeting_booking |
| `DB_USER` | Database username | - |
| `DB_PASSWORD` | Database password | - |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | 587 |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASS` | SMTP password | - |
| `SMTP_SECURE` | Use TLS for SMTP | false |
| `SMTP_FROM` | Email from address | Open Meeting <noreply@openmeeting.com> |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | http://localhost |
| `APP_URL` | Public frontend URL | http://localhost |
| `API_URL` | Public API URL | http://localhost:3001 |

### Persistent Data

The SQLite database is stored in `/app/backend/data`. Mount a volume to persist data:

```bash
docker run -d -p 80:80 -v open-meeting-data:/app/backend/data open-meeting
```

## CI/CD Pipeline

The project includes a GitHub Actions workflow that:

1. **Build & Test**: Compiles TypeScript for both backend and frontend
2. **Docker Build**: Creates Docker image and exports as tar archive
3. **Release**: Creates GitHub releases with the Docker image attached

### Creating a Release

#### Option 1: From GitHub UI (Recommended)

1. Go to the **Actions** tab in GitHub
2. Select **CI/CD Pipeline** from the workflows list
3. Click **Run workflow**
4. Enter the version (e.g., `v1.0.0`)
5. Optionally check "Mark as pre-release"
6. Click **Run workflow**

#### Option 2: From Terminal

```bash
# Tag a new version
git tag v1.0.0
git push origin v1.0.0
```

The CI/CD pipeline will automatically:
- Build the Docker image
- Export it as a compressed tar file (`open-meeting-v1.0.0.tar.gz`)
- Create a GitHub release with changelog
- Attach the Docker image tar file to the release

### Using a Release

Download the `open-meeting-vX.X.X.tar.gz` file from the release assets, then:

```bash
# Load the image into Docker
gunzip -c open-meeting-v1.0.0.tar.gz | docker load

# Run the container
docker run -d -p 80:80 --name open-meeting open-meeting:v1.0.0
```
