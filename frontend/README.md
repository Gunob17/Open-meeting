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
| `SsoCallbackPage` | `/sso/callback` | Public | SSO redirect handler |
| `CalendarPage` | `/` | User+ | 7-day calendar with color-coded room availability |
| `RoomsListPage` | `/rooms` | User+ | Room cards with filtering by capacity and amenities |
| `MyBookingsPage` | `/my-bookings` | User+ | Upcoming, past, and cancelled bookings |
| `TwoFaSettingsPage` | `/account/security` | User+ | 2FA setup, backup codes, trusted device management |
| `UsersPage` | `/users` | Company Admin+ | User management with role and auth source badges |
| `LdapConfigPage` | `/admin/ldap/:companyId` | Company Admin+ | LDAP connection, attributes, groups, sync |
| `SsoConfigPage` | `/admin/sso/:companyId` | Company Admin+ | OIDC/SAML configuration |
| `ReceptionistPage` | `/reception` | Receptionist | Daily guest check-in/check-out dashboard |
| `AdminRoomsPage` | `/admin/rooms` | Park Admin+ | Room CRUD with amenities, hours, company locks |
| `DevicesPage` | `/admin/devices` | Park Admin+ | Device management + firmware upload and deployment |
| `CompaniesPage` | `/admin/companies` | Park Admin+ | Company management with LDAP/SSO shortcuts |
| `StatisticsPage` | `/admin/statistics` | Park Admin+ | Utilization charts, trends, top bookers |
| `SettingsPage` | `/admin/settings` | Park Admin+ | Global hours, 2FA config, per-room overrides |
| `ParksPage` | `/admin/parks` | Super Admin | Multi-site management with logos |

### Components (`src/components/`)

| Component | Purpose |
|-----------|---------|
| `Layout` | App shell with sidebar navigation, park selector, user info, responsive hamburger menu |
| `BookingModal` | Create/edit booking form with attendees and external guest support |

### Context (`src/context/`)

`AuthContext` provides:
- `user` — Current user object
- `isSuperAdmin`, `isParkAdmin`, `isAdmin`, `isCompanyAdmin`, `isReceptionist` — Role flags
- `login()`, `logout()` — Auth actions
- Token management with keep-logged-in and inactivity timeout (7 days)

### API Service (`src/services/api.ts`)

Centralized HTTP client with:
- Bearer token authentication on all requests
- Auto-logout on 401/403 responses
- Activity timestamp tracking for session timeout
- Trusted device token management
- Methods for every API endpoint (see [API Reference](../docs/API.md))

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
