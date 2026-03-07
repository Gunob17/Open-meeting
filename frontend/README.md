# Frontend

React 18 + TypeScript single-page application for Open Meeting.

## Quick Start

```bash
npm install
npm start      # Development server on http://localhost:3000
npm run build  # Production build
```

Set `REACT_APP_API_URL` to override the API base URL (defaults to `http://localhost:3001/api`).

## Architecture

### Pages (`src/pages/`)

| Page | Route | Access | Description |
|------|-------|--------|-------------|
| `LoginPage` | `/login` | Public | Email-first login with SSO discovery, 2FA setup/verify |
| `SetupPage` | `/setup` | Public | Initial setup wizard (demo or production mode) |
| `SsoCallbackPage` | `/sso/callback` | Public | SSO redirect handler (validates JWT format before storing) |
| `CompleteInvitePage` | `/complete-invite` | Public | Invite acceptance — set password with live strength meter |
| `CalendarPage` | `/` | User+ | 7-day calendar with color-coded room availability |
| `RoomsListPage` | `/rooms` | User+ | Room cards with filtering by capacity and amenities |
| `MyBookingsPage` | `/my-bookings` | User+ | Upcoming, past, and cancelled bookings |
| `UserSettingsPage` | `/account/settings` | User+ | Account settings — **Security** tab (2FA, backup codes, trusted devices), **Calendar** tab (iCal feed token management), **Password** tab, and **Organization** tab for Company Admins (company-level 2FA enforcement) |
| `UsersPage` | `/users` | Company Admin+ | User management with role and auth source badges |
| `LdapConfigPage` | `/admin/ldap/:companyId` | Company Admin+ | LDAP connection, attributes, groups, sync |
| `SsoConfigPage` | `/admin/sso/:companyId` | Company Admin+ | OIDC/SAML configuration |
| `ReceptionistPage` | `/reception` | Receptionist | Daily guest check-in/check-out dashboard |
| `AdminRoomsPage` | `/admin/rooms` | Park Admin+ | Room CRUD with amenities, hours, company locks, IMAP/SMTP config |
| `DevicesPage` | `/admin/devices` | Park Admin+ | Device management + firmware upload and deployment |
| `CompaniesPage` | `/admin/companies` | Park Admin+ | Company management with LDAP/SSO shortcuts |
| `StatisticsPage` | `/admin/statistics` | Park Admin+ | Utilization charts, trends, top bookers |
| `SettingsPage` | `/admin/settings` | Park Admin+ | Global hours, timezone, time format; 2FA enforcement (super admin: system-wide, park admin: site-level); system announcement banner (super admin only) |
| `ParksPage` | `/admin/parks` | Super Admin | Multi-site management with logos |

> **Note:** `/account/security` redirects to `/account/settings` (Security tab) for backwards compatibility.

### Components (`src/components/`)

| Component | Purpose |
|-----------|---------|
| `Layout` | App shell with sidebar navigation, park selector, user info, system banner display, guided tour integration, responsive hamburger menu |
| `BookingModal` | Create/edit booking form with attendees and external guest support |
| `TourGuide` | Wrapper around react-joyride — renders the spotlight onboarding tour |
| `DevRoleWidget` | Development-only widget for switching role views without re-logging in |

### Context (`src/context/`)

`AuthContext` provides:
- `user` — Current user object
- `isSuperAdmin`, `isParkAdmin`, `isAdmin`, `isCompanyAdmin`, `isReceptionist` — Role flags
- `login()`, `logout()` — Auth actions
- Token management with keep-logged-in and inactivity timeout (7 days)

`TourContext` provides:
- `startTour()` — Trigger the guided tour from any page (used by UserSettingsPage replay button)

`SettingsContext` provides:
- `timeFormat` — Global time format (`12h`/`24h`) for consistent display across pages

### API Service (`src/services/api.ts`)

Centralized HTTP client with:
- Bearer token authentication on all requests
- Auto-logout on 401/403 responses
- Activity timestamp tracking for session timeout
- Trusted device token management
- Methods for every API endpoint (see [API Reference](../docs/API.md))

### Tour Steps (`src/tour/`)

`tourSteps.ts` exports role-specific step arrays for the onboarding tour. Each role (`super_admin`, `park_admin`, `company_admin`, `user`, `receptionist`) has a tailored set of steps targeting `data-tour="..."` attributes on sidebar nav elements. The tour auto-starts for new users (`hasSeenTour === false`) and can be replayed from **Account Settings**.

### Routing

Routes are defined in `App.tsx`. Protected routes check authentication via `AuthContext`. Role-based visibility is handled in the `Layout` sidebar navigation.

### Styling

Single global stylesheet (`styles.css`) using CSS custom properties. Responsive breakpoints:
- Mobile: < 768px (collapsible sidebar, single-room calendar view)
- Desktop: full sidebar, multi-room calendar columns

### Calendar Color Coding

| Color | Meaning |
|-------|---------|
| Light green | Available |
| Orange | Partially booked (gaps available) |
| Red | Fully booked |
| Gray | Outside operating hours |
| Blue tint | Company-restricted (user cannot book) |
| Light gray | Past time slots |
