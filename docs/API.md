# API Reference

Base URL: `/api`

All endpoints require JWT authentication unless noted otherwise. Include the token as `Authorization: Bearer <token>`.

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | None | Login (local, LDAP, or trusted device bypass) |
| GET | `/auth/me` | Required | Get current user profile |
| POST | `/auth/refresh` | Required | Refresh JWT token |
| POST | `/auth/change-password` | Required | Change password |

### Two-Factor Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/2fa/setup` | Partial/Full | Generate 2FA secret and QR code |
| POST | `/auth/2fa/setup/confirm` | Partial/Full | Confirm 2FA setup with TOTP code, returns backup codes |
| POST | `/auth/2fa/verify` | Partial | Verify 2FA code or backup code, returns full token |
| POST | `/auth/2fa/disable` | Required | Disable 2FA (requires password confirmation) |
| GET | `/auth/2fa/status` | Required | Get 2FA enabled status |
| GET | `/auth/2fa/trusted-devices` | Required | List user's trusted devices |
| DELETE | `/auth/2fa/trusted-devices/:id` | Required | Revoke a trusted device |

---

## Parks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/parks` | Required | List parks (super admin sees all, others see own) |
| GET | `/parks/:id` | Required | Get park details |
| POST | `/parks` | Super Admin | Create park |
| PUT | `/parks/:id` | Super Admin | Update park |
| PUT | `/parks/:id/reception` | Park Admin+ | Update reception settings |
| DELETE | `/parks/:id` | Super Admin | Delete park |
| POST | `/parks/:id/logo` | Super Admin | Upload park logo (multipart, max 2MB) |
| GET | `/parks/:id/logo/:filename` | None | Get park logo image |
| DELETE | `/parks/:id/logo` | Super Admin | Remove park logo |

---

## Companies

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/companies` | Required | List companies (filtered by park) |
| GET | `/companies/:id` | Required | Get company details |
| POST | `/companies` | Park Admin+ | Create company |
| PUT | `/companies/:id` | Park Admin+ | Update company |
| DELETE | `/companies/:id` | Park Admin+ | Delete company |

---

## Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users` | Park Admin+ | List all users |
| GET | `/users/company/:companyId` | Company Admin+ | List users in company |
| GET | `/users/:id` | Required | Get user details |
| POST | `/users` | Company Admin+ | Create user |
| PUT | `/users/:id` | Company Admin+ | Update user |
| POST | `/users/:id/reset-2fa` | Park Admin+ | Reset user's 2FA |
| DELETE | `/users/:id` | Company Admin+ | Delete user |

---

## Meeting Rooms

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/rooms` | Required | List rooms (respects park filter and company locks) |
| GET | `/rooms/:id` | Required | Get room details |
| GET | `/rooms/:id/availability` | Required | Check room availability for time range |
| POST | `/rooms` | Park Admin+ | Create room |
| PUT | `/rooms/:id` | Park Admin+ | Update room |
| DELETE | `/rooms/:id` | Park Admin+ | Delete room |

---

## Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/bookings` | Required | List bookings (optional `startDate`, `endDate` query params) |
| GET | `/bookings/my` | Required | List current user's bookings |
| GET | `/bookings/:id` | Required | Get booking details with room and user info |
| POST | `/bookings` | Required | Create booking |
| PUT | `/bookings/:id` | Required | Update booking (own or admin) |
| POST | `/bookings/:id/cancel` | Required | Cancel booking (own or admin) |
| POST | `/bookings/:id/move` | Park Admin+ | Move booking to different room |
| DELETE | `/bookings/:id` | Park Admin+ | Delete booking (notifies owner) |

---

## Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/settings` | Required | Get global settings |
| PUT | `/settings` | Park Admin+ | Update booking hours |
| PUT | `/settings/2fa` | Super Admin | Update 2FA enforcement settings |

---

## Device Management (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/devices` | Park Admin+ | List all devices with room details |
| GET | `/devices/room/:roomId` | Park Admin+ | List devices in room |
| GET | `/devices/:id` | Park Admin+ | Get device details |
| POST | `/devices` | Park Admin+ | Create device (auto-generates token) |
| PUT | `/devices/:id` | Park Admin+ | Update device |
| POST | `/devices/:id/regenerate-token` | Park Admin+ | Regenerate device auth token |
| DELETE | `/devices/:id` | Park Admin+ | Delete device |
| POST | `/devices/firmware/schedule-update` | Park Admin+ | Batch schedule firmware update |
| POST | `/devices/:id/firmware/cancel-update` | Park Admin+ | Cancel pending firmware update |

---

## Device API (IoT Devices)

Authentication: `X-Device-Token` header.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/device/status` | Device Token | Get room status, current/upcoming bookings |
| POST | `/device/quick-book` | Device Token | Quick book room for specified duration |
| GET | `/device/info` | Device Token | Get device and room information |
| GET | `/device/ping` | Device Token | Health check |
| POST | `/device/firmware/report` | Device Token | Report current firmware version |
| GET | `/device/firmware/check` | Device Token | Check for available firmware updates |
| GET | `/device/firmware/download/:version` | Device Token | Download firmware binary |

---

## Firmware

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/firmware` | Park Admin+ | List all firmware versions |
| GET | `/firmware/latest` | Park Admin+ | Get latest active firmware |
| POST | `/firmware` | Park Admin+ | Upload firmware (multipart/form-data) |
| DELETE | `/firmware/:id` | Park Admin+ | Delete firmware version |
| PATCH | `/firmware/:id/active` | Park Admin+ | Toggle firmware active status |

---

## LDAP

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/ldap/config/:companyId` | Company Admin+ | Get LDAP config for company |
| POST | `/ldap/config` | Company Admin+ | Create LDAP config |
| PUT | `/ldap/config/:id` | Company Admin+ | Update LDAP config |
| DELETE | `/ldap/config/:id` | Company Admin+ | Delete LDAP config |
| POST | `/ldap/config/:id/enable` | Company Admin+ | Enable LDAP |
| POST | `/ldap/config/:id/disable` | Company Admin+ | Disable LDAP |
| POST | `/ldap/config/:id/test` | Company Admin+ | Test LDAP connection |
| POST | `/ldap/config/:id/sync` | Company Admin+ | Trigger manual user sync |
| GET | `/ldap/config/:id/sync-status` | Company Admin+ | Get last sync status |

---

## SSO (Single Sign-On)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/sso/discover?email=` | None | Discover SSO provider by email domain |
| GET | `/sso/init/:configId` | None | Initiate SSO login, returns auth URL |
| GET | `/sso/callback/oidc` | None | OIDC callback (redirects to frontend with token) |
| POST | `/sso/callback/saml` | None | SAML callback (redirects to frontend with token) |
| GET | `/sso/saml/metadata/:configId` | None | SAML Service Provider metadata XML |
| GET | `/sso/config/:companyId` | Company Admin+ | Get SSO config for company |
| POST | `/sso/config` | Company Admin+ | Create SSO config |
| PUT | `/sso/config/:id` | Company Admin+ | Update SSO config |
| DELETE | `/sso/config/:id` | Company Admin+ | Delete SSO config |
| POST | `/sso/config/:id/enable` | Company Admin+ | Enable SSO |
| POST | `/sso/config/:id/disable` | Company Admin+ | Disable SSO |

---

## Receptionist

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/receptionist/guests` | Receptionist | List guests for date (`date`, `parkId` query params) |
| POST | `/receptionist/guests/:id/checkin` | Receptionist | Check in guest |
| POST | `/receptionist/guests/:id/checkout` | Receptionist | Check out guest |
| POST | `/receptionist/guests/:id/undo-checkin` | Receptionist | Undo guest check-in |

---

## Statistics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/statistics/summary` | Park Admin+ | Overall booking summary |
| GET | `/statistics/rooms` | Park Admin+ | Room utilization stats |
| GET | `/statistics/hourly` | Park Admin+ | Hourly booking distribution |
| GET | `/statistics/daily` | Park Admin+ | Daily booking trend |
| GET | `/statistics/amenities` | Park Admin+ | Amenity popularity ranking |
| GET | `/statistics/top-bookers` | Park Admin+ | Top bookers list |

All statistics endpoints accept `startDate`, `endDate`, and `parkId` query parameters.

---

## Setup

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/setup/status` | None | Check if system is initialized |
| POST | `/setup/demo` | None | Initialize with demo data |
| POST | `/setup/production` | None | Initialize for production use |
