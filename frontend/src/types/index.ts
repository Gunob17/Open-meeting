export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  PARK_ADMIN = 'park_admin',
  COMPANY_ADMIN = 'company_admin',
  USER = 'user'
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
  twofaEnforcement?: TwoFaLevelEnforcement;
  receptionEmail?: string | null;
  receptionGuestFields?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type AuthSource = 'local' | 'ldap' | 'oidc' | 'saml';
export type SsoProtocol = 'oidc' | 'saml';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  parkId?: string | null;
  twofaEnabled?: boolean;
  addonRoles?: string[];
  isActive?: boolean;
  authSource?: AuthSource;
  inviteToken?: string | null;
  createdAt?: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  parkId: string;
  twofaEnforcement?: TwoFaLevelEnforcement;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  amenities: string[];
  floor: string;
  address: string;
  description: string;
  isActive: boolean;
  parkId: string;
  openingHour?: number | null;
  closingHour?: number | null;
  lockedToCompanyIds?: string[]; // Companies that can book this room (empty = open to all)
  lockedToCompanies?: Company[];
  quickBookDurations?: number[]; // Available quick booking durations in minutes for device
  createdAt?: string;
  updatedAt?: string;
}

export interface Settings {
  id: string;
  openingHour: number;
  closingHour: number;
  twofaEnforcement?: TwoFaEnforcement;
  twofaMode?: TwoFaMode;
  twofaTrustedDeviceDays?: number;
  updatedAt?: string;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  externalGuests?: ExternalGuest[];
  status: 'confirmed' | 'cancelled';
  room?: MeetingRoom;
  user?: User;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user?: User;
  requiresTwoFa?: boolean;
  twofaPending?: boolean;
  twofaSetupRequired?: boolean;
  deviceToken?: string;
}

export interface TwoFaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  otpauthUrl: string;
}

export interface TwoFaStatusResponse {
  twofaEnabled: boolean;
  enforcement: TwoFaEnforcement;
  mode: TwoFaMode;
  trustedDeviceDays: number;
}

export interface TrustedDeviceInfo {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface ApiError {
  error: string;
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
  pendingFirmwareVersion: string | null;  // Version scheduled for next update
  hasUpdate?: boolean;
  latestVersion?: string | null;
  room?: MeetingRoom;
  createdAt?: string;
  updatedAt?: string;
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

export interface GuestVisit {
  id: string;
  bookingId: string;
  guestName: string;
  guestEmail: string | null;
  guestCompany: string | null;
  expectedArrival: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
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
  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcScopes: string | null;
  samlEntryPoint: string | null;
  samlIssuer: string | null;
  samlCert: string | null;
  samlCallbackUrl: string | null;
  autoCreateUsers: boolean;
  defaultRole: string;
  emailDomains: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SsoDiscoveryResult {
  hasSso: boolean;
  configId?: string;
  protocol?: SsoProtocol;
  displayName?: string;
}
