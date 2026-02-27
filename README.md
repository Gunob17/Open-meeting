<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="open-meeting-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="open-meeting.svg">
    <img src="open-meeting.svg" alt="Open Meeting" width="400">
  </picture>
</p>

# Open Meeting

**The open-source meeting room booking platform built for shared offices, co-working spaces, and multi-site organizations.**

Open Meeting gives your organization a complete room booking system — from a visual calendar and smart conflict prevention, to IoT room displays, enterprise identity integration, and visitor management. Deploy with a single Docker command and start booking in minutes.

---

## Why Open Meeting?

- **Ready for your organization** — Manage multiple sites, companies, and user roles from a single platform. Scale from one office to dozens.
- **Enterprise-grade security** — Two-factor authentication, LDAP directory sync, and Single Sign-On (OIDC & SAML) out of the box.
- **Walk-up room displays** — Mount affordable ESP32 touchscreen devices outside meeting rooms for live status and one-tap booking.
- **Professional visitor experience** — Track external guests with check-in/check-out, automated reception notifications, and configurable visitor fields.
- **Data-driven space decisions** — Built-in analytics show room utilization, peak hours, and underused spaces so you can optimize your real estate.
- **Deploy in minutes** — One Docker container, one command. Works with SQLite out of the box or connect to PostgreSQL, MySQL, or MSSQL.

---

## Features

### Smart Room Booking

No more double-bookings or scheduling chaos. The visual weekly calendar shows every room's availability at a glance with color-coded time slots — green for available, red for booked, orange for partially available. Users click any open slot to book, and the system automatically prevents conflicts. Bookings can include internal attendees (who receive calendar invites) and external guests.

- Visual 7-day calendar with all rooms side-by-side
- Each booking displayed in a distinct color for at-a-glance identification
- Multiple bookings within the same hour are all shown individually
- Past bookings remain visible in the calendar for the full current week
- Automatic conflict detection — overlapping bookings are impossible
- Book partial time slots when rooms have gaps between meetings
- Add attendees by email with automatic ICS calendar invitations
- Browse rooms by capacity, amenities, and real-time availability
- Mobile-responsive design works on any device

### Multi-Site Management

Built for organizations with multiple locations. Each site ("park") operates independently with its own rooms, companies, and users — while super admins maintain oversight across everything. Perfect for co-working spaces, business parks, and enterprises with regional offices.

- **Super Admins** oversee all sites, create park administrators, and set system-wide policies
- **Park Admins** manage rooms, companies, devices, and settings within their site
- **Company Admins** manage their own team's users, LDAP, and SSO configuration
- **Users** book rooms and manage their own meetings
- Park-level branding with custom logos

### Room Access Control

Not every room should be available to everyone. Lock specific rooms to certain companies so that premium or specialized spaces are only visible and bookable by authorized teams. Set per-room booking hours or use global defaults — giving you fine-grained control over who can book what, and when.

- Restrict rooms to specific companies — unauthorized users won't even see them
- Per-room opening and closing hours (or inherit from global settings)
- Configurable quick-booking durations per room (15 min, 30 min, 1 hour, etc.)
- Admins can move bookings between rooms or remove bookings with reason notifications

### Enterprise Security

Meet your organization's security and compliance requirements with built-in two-factor authentication. Enforcement is hierarchical — set it system-wide, per site, or per company. Users can set up 2FA with any TOTP authenticator app, save backup codes for recovery, and trust their devices to skip verification on recognized browsers.

- TOTP-based 2FA with QR code setup (Google Authenticator, Authy, etc.)
- Backup codes for account recovery
- Trusted device management — skip 2FA on recognized browsers
- Hierarchical enforcement: system-wide, per site, or per company (disabled / optional / required)
- Two modes: require on every login, or trust verified devices for a configurable period

### Identity Provider Integration

Your users are already in your directory — Open Meeting connects to it. Sync users automatically from LDAP directories with scheduled imports and group-based role mapping. Or enable Single Sign-On so users log in with their existing corporate credentials through OIDC or SAML, with automatic account creation on first login.

- **LDAP**: Automatic user sync, group-to-role mapping, configurable sync intervals, connection testing
- **OIDC**: Works with Keycloak, Azure AD, Okta, Google Workspace, and any OpenID Connect provider
- **SAML 2.0**: Works with ADFS, Shibboleth, OneLogin, and any SAML identity provider
- Just-in-time user provisioning — accounts created automatically on first SSO login
- Email domain-based auto-discovery at the login screen
- Per-company configuration — each tenant connects their own identity provider
- All credentials encrypted at rest (AES-256-GCM)

### Visitor & Guest Management

Create a professional visitor experience. When users add external guests to their bookings, the reception desk is automatically notified. Receptionists use a dedicated dashboard to check guests in and out throughout the day, with real-time status tracking and overstay alerts.

- Add external guests to any booking with name, email, and company fields
- Automatic email notifications to the reception desk with guest details
- Dedicated receptionist dashboard with daily guest overview
- One-click check-in and check-out with timestamps
- Guest status tracking: pending, checked in, checked out
- Overstay detection — highlights guests still on-site past their meeting end time
- Configurable guest information fields per site

### IoT Room Displays

Mount affordable ESP32 touchscreen devices outside each meeting room for instant, at-a-glance room status. The 2.8" color display shows whether a room is available or occupied, the current meeting details, and upcoming bookings. An RGB LED provides a visible status indicator from down the hallway. Anyone can walk up and book the room with a single tap.

- 2.8" color touchscreen with live room status (available / occupied)
- RGB LED indicator visible from a distance (green = free, red = busy)
- One-tap quick booking with configurable durations
- "End Meeting Early" option — only shown for meetings booked from the device
- Shows current meeting and next 3 upcoming bookings
- WiFi setup via captive portal — no programming required after initial flash
- Automatic screen timeout for power savings
- 25+ timezone support for global deployments
- Auto-reconnection with boot loop protection

### Remote Device Management

Manage your fleet of room displays from the admin panel — no physical access needed. Upload firmware updates and push them to all devices at once, or target specific devices. Monitor device health with last-seen timestamps and firmware version tracking.

- Upload firmware versions with release notes
- Schedule updates for individual devices or batch deploy to all devices at once
- Devices automatically check for and apply updates over-the-air (OTA)
- Monitor device status: online/offline, last seen, current firmware version
- Regenerate device security tokens from the admin panel

### Analytics & Insights

Make informed decisions about your workspace. Built-in analytics track how your rooms are actually being used — which rooms are in high demand, which are sitting empty, what times are busiest, and which amenities matter most to your teams.

- Room utilization percentages with visual indicators
- Hourly and daily booking distribution charts
- Peak hour identification
- Amenity popularity ranking
- Top bookers by user and company
- Underutilized room detection (highlights rooms below 30% utilization)
- Filterable by date range and site

### Automated Notifications

Everyone stays in the loop without lifting a finger. Booking confirmations, cancellations, and schedule changes are sent automatically as emails with standard ICS calendar attachments that work with Outlook, Google Calendar, and Apple Calendar.

- Meeting invitations with ICS calendar attachments
- Cancellation notices to all attendees
- Admin action notifications (when a booking is moved or deleted, the organizer is informed with the reason)
- Reception alerts when external guests are expected
- Works with any SMTP email provider

---

## Get Running in Minutes

```bash
# Pull and run with Docker
docker run -d -p 80:80 --name open-meeting -v open-meeting-data:/app/backend/data open-meeting:latest
```

Open `http://localhost` and follow the setup wizard to create your admin account — or load demo data to explore all features immediately.

For releases, download the image from [GitHub Releases](../../releases):

```bash
gunzip -c open-meeting-v1.0.0.tar.gz | docker load
docker run -d -p 80:80 --name open-meeting -v open-meeting-data:/app/backend/data open-meeting:v1.0.0
```

---

## Deployment & Configuration

### Docker Compose

```bash
# Production
docker-compose up -d

# Development (separate backend and frontend services)
docker-compose -f docker-compose.dev.yml up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | **(change in production!)** |
| `LDAP_ENCRYPTION_KEY` | Encryption key for stored LDAP/SSO secrets | Falls back to `JWT_SECRET` |
| `DB_TYPE` | Database engine (`sqlite`, `pg`, `mysql`, `mssql`) | `sqlite` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | — |
| `DB_NAME` | Database name | `meeting_booking` |
| `DB_USER` | Database username | — |
| `DB_PASSWORD` | Database password | — |
| `SMTP_HOST` | SMTP server hostname | — |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_SECURE` | Use TLS for SMTP | `false` |
| `SMTP_FROM` | Sender address for emails | `Open Meeting <noreply@openmeeting.com>` |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost` |
| `APP_URL` | Public URL of the application | `http://localhost` |

### Persistent Data

The database is stored in `/app/backend/data` inside the container. Mount a Docker volume to persist data across container restarts:

```bash
docker run -d -p 80:80 -v open-meeting-data:/app/backend/data open-meeting
```

### Database Options

Open Meeting uses SQLite by default — no external database setup required. For larger deployments, connect to PostgreSQL, MySQL, MariaDB, or MSSQL by setting the `DB_*` environment variables.

---

## Try It Out

After choosing "Demo Mode" during setup, you can explore the full system with these accounts:

| Role | Email | Password | What you can do |
|------|-------|----------|-----------------|
| Super Admin | admin@openmeeting.com | admin123 | Manage all sites, companies, and system settings |
| Park Admin | parkadmin@downtown.com | parkadmin123 | Manage rooms, devices, and users for Downtown Business Park |
| Company Admin | admin@techcorp.com | techcorp123 | Manage TechCorp users, LDAP, and SSO |
| User | john@techcorp.com | john123 | Book rooms and manage personal meetings |

Demo data includes 3 sites, 7 companies, 12 users, and 10 meeting rooms with various configurations.

---

## For Developers

Open Meeting is built with Node.js/Express (backend), React 18 (frontend), and PlatformIO/Arduino (ESP32 firmware), all in TypeScript.

- [API Reference](docs/API.md) — Complete REST API documentation with all 87+ endpoints
- [Development Guide](docs/DEVELOPMENT.md) — Local setup, project structure, tech stack, and email configuration
- [Backend Guide](backend/README.md) — Models, routes, services, migrations, and middleware
- [Frontend Guide](frontend/README.md) — Pages, components, routing, and state management
- [Device Firmware](device/README.md) — ESP32 hardware setup, build instructions, and configuration
