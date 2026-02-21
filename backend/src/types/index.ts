export enum UserRole {
  SUPER_ADMIN = 'super_admin',     // Super administrator - can manage multiple parks
  PARK_ADMIN = 'park_admin',       // Park administrator - can manage rooms and users within their park
  COMPANY_ADMIN = 'company_admin', // Company administrator - can manage users in their company
  USER = 'user'                    // Regular user - can book meeting rooms
}

export type TwoFaEnforcement = 'disabled' | 'optional' | 'required';
export type TwoFaLevelEnforcement = 'inherit' | 'optional' | 'required';
export type TwoFaMode = 'every_login' | 'trusted_device';

export interface ExternalGuest {
  name: string;
  email?: string;
  company?: string;
}

export interface Park {
  id: string;
  name: string;
  address: string;
  description: string;
  logoUrl: string | null;
  isActive: boolean;
  twofaEnforcement: TwoFaLevelEnforcement;
  receptionEmail: string | null;
  receptionGuestFields: string[];
  createdAt: string;
  updatedAt: string;
}

export type AuthSource = 'local' | 'ldap' | 'oidc' | 'saml';
export type SsoProtocol = 'oidc' | 'saml';

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId: string | null;  // null for super_admin who can access all parks
  twofaEnabled: boolean;
  twofaSecret: string | null;
  twofaBackupCodes: string | null;
  addonRoles: string[];
  isActive: boolean;
  authSource: AuthSource;
  ldapDn: string | null;
  ldapSyncedAt: string | null;
  ssoSubjectId: string | null;
  ssoProviderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  parkId: string;
  twofaEnforcement: TwoFaLevelEnforcement;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  amenities: string; // JSON array stored as string
  floor: string;
  address: string;
  description: string;
  isActive: boolean;
  parkId: string;
  openingHour: number | null;  // Room-specific opening hour (null = use global)
  closingHour: number | null;  // Room-specific closing hour (null = use global)
  lockedToCompanyIds: string[]; // If set, only these companies can book (empty array = open to all)
  quickBookDurations: number[]; // Available quick booking durations in minutes (e.g., [30, 60, 90, 120])
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: string;
  openingHour: number;
  closingHour: number;
  twofaEnforcement: TwoFaEnforcement;
  twofaMode: TwoFaMode;
  twofaTrustedDeviceDays: number;
  updatedAt: string;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendees: string; // JSON array of email addresses stored as string
  externalGuests: string; // JSON array of ExternalGuest objects stored as string
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled'
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
  parkId: string | null;
  twofaPending?: boolean;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  deviceToken: string;
  deviceName: string;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface BookingWithDetails extends Booking {
  room?: MeetingRoom;
  user?: Omit<User, 'password'>;
}

export interface CreateBookingRequest {
  roomId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  externalGuests?: ExternalGuest[];
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId?: string | null;
  addonRoles?: string[];
}

export interface CreateRoomRequest {
  name: string;
  capacity: number;
  amenities: string[];
  floor: string;
  address: string;
  description?: string;
  parkId: string;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyIds?: string[]; // Companies that can access this room (empty = open to all)
  quickBookDurations?: number[]; // Quick booking durations in minutes
}

export interface CreateCompanyRequest {
  name: string;
  address: string;
  parkId: string;
}

export interface CreateParkRequest {
  name: string;
  address: string;
  description?: string;
  receptionEmail?: string | null;
  receptionGuestFields?: string[];
}

// Screen device types
export interface Device {
  id: string;
  name: string;
  token: string;
  roomId: string;
  deviceType: string;
  isActive: boolean;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  pendingFirmwareVersion: string | null;  // Version to be installed on next check-in
  createdAt: string;
  updatedAt: string;
}

export interface DeviceWithRoom extends Device {
  room?: MeetingRoom;
}

export interface CreateDeviceRequest {
  name: string;
  roomId: string;
  deviceType?: string;  // Optional, defaults to 'esp32-display'
}

export interface DeviceRoomStatus {
  room: MeetingRoom;
  currentBooking: BookingWithDetails | null;
  upcomingBookings: BookingWithDetails[];
  isAvailable: boolean;
}

export interface DeviceQuickBookingRequest {
  title: string;
  durationMinutes: number; // Quick booking duration (e.g., 15, 30, 60 minutes)
}

// Firmware types for OTA updates
export interface Firmware {
  id: string;
  version: string;
  deviceType: string;
  filename: string;
  size: number;
  checksum: string;
  releaseNotes: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateFirmwareRequest {
  version: string;
  deviceType: string;
  releaseNotes?: string;
}

export interface OtaUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  latestFirmware?: Firmware;
}

export interface GuestVisit {
  id: string;
  bookingId: string;
  guestName: string;
  guestEmail: string | null;
  guestCompany: string | null;
  expectedArrival: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  createdAt: string;
}

export interface GuestVisitWithDetails extends GuestVisit {
  bookingTitle?: string;
  bookingEndTime?: string;
  roomName?: string;
  roomClosingHour?: number | null;
  organizerName?: string;
  organizerCompany?: string;
}

// LDAP types
export interface LdapRoleMapping {
  ldapGroupDn: string;
  appRole: string;
}

export interface LdapConfig {
  id: string;
  companyId: string;
  isEnabled: boolean;
  serverUrl: string;
  bindDn: string;
  searchBase: string;
  userFilter: string;
  usernameAttribute: string;
  emailAttribute: string;
  nameAttribute: string;
  groupSearchBase: string | null;
  groupFilter: string | null;
  groupMemberAttribute: string;
  roleMappings: LdapRoleMapping[];
  defaultRole: string;
  syncIntervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  lastSyncUserCount: number | null;
  useStarttls: boolean;
  tlsRejectUnauthorized: boolean;
  connectionTimeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLdapConfigRequest {
  companyId: string;
  serverUrl: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  userFilter?: string;
  usernameAttribute?: string;
  emailAttribute?: string;
  nameAttribute?: string;
  groupSearchBase?: string;
  groupFilter?: string;
  groupMemberAttribute?: string;
  roleMappings?: LdapRoleMapping[];
  defaultRole?: string;
  syncIntervalHours?: number;
  useStarttls?: boolean;
  tlsRejectUnauthorized?: boolean;
  connectionTimeoutMs?: number;
}

export interface LdapSyncResult {
  created: number;
  updated: number;
  disabled: number;
  reactivated: number;
  errors: string[];
  totalLdapUsers: number;
}

// SSO types
export interface SsoConfig {
  id: string;
  companyId: string;
  isEnabled: boolean;
  protocol: SsoProtocol;
  displayName: string;
  // OIDC fields
  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcScopes: string | null;
  // SAML fields
  samlEntryPoint: string | null;
  samlIssuer: string | null;
  samlCert: string | null;
  samlCallbackUrl: string | null;
  // Common
  autoCreateUsers: boolean;
  defaultRole: string;
  emailDomains: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSsoConfigRequest {
  companyId: string;
  protocol: SsoProtocol;
  displayName?: string;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcScopes?: string;
  samlEntryPoint?: string;
  samlIssuer?: string;
  samlCert?: string;
  samlCallbackUrl?: string;
  autoCreateUsers?: boolean;
  defaultRole?: string;
  emailDomains?: string[];
}

export interface SsoDiscoveryResult {
  hasSso: boolean;
  configId?: string;
  protocol?: SsoProtocol;
  displayName?: string;
}
