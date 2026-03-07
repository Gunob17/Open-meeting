import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../models/database';

export type AuditOutcome = 'success' | 'failure';

export interface AuditEvent {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
}

// Known audit actions — extend as needed
export const AuditAction = {
  // Authentication
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',
  AUTH_2FA_VERIFY_SUCCESS: 'auth.2fa.verify.success',
  AUTH_2FA_VERIFY_FAILURE: 'auth.2fa.verify.failure',
  AUTH_2FA_SETUP: 'auth.2fa.setup',
  AUTH_2FA_DISABLE: 'auth.2fa.disable',
  AUTH_UNAUTHORIZED_ACCESS: 'auth.unauthorized_access',
  // Users
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_INVITE_SEND: 'user.invite.send',
  USER_INVITE_RESEND: 'user.invite.resend',
  USER_INVITE_COMPLETE: 'user.invite.complete',
  USER_DATA_EXPORT: 'user.data.export',
  // Bookings
  BOOKING_CREATE: 'booking.create',
  BOOKING_UPDATE: 'booking.update',
  BOOKING_CANCEL: 'booking.cancel',
  BOOKING_DELETE: 'booking.delete',
  BOOKING_MOVE: 'booking.move',
  BOOKING_EMAIL_CREATE: 'booking.email.create',         // booking created via iMIP email invite
  BOOKING_EMAIL_UPDATE: 'booking.email.update',         // existing booking updated via iMIP email
  BOOKING_EMAIL_DECLINED: 'booking.email.declined',     // booking request declined (room conflict)
  BOOKING_EMAIL_REJECTED_SIZE: 'booking.email.rejected.size',
  BOOKING_EMAIL_REJECTED_DKIM: 'booking.email.rejected.dkim',
  BOOKING_EMAIL_REJECTED_DEDUP: 'booking.email.rejected.dedup',
  BOOKING_EMAIL_REJECTED_ICAL: 'booking.email.rejected.ical',
  BOOKING_EMAIL_REJECTED_ROOM: 'booking.email.rejected.room',
  BOOKING_EMAIL_REJECTED_USER: 'booking.email.rejected.user',
  BOOKING_EMAIL_REJECTED_RATELIMIT: 'booking.email.rejected.ratelimit',
  // Calendar feed tokens
  CALENDAR_TOKEN_CREATE: 'calendar.token.create',
  CALENDAR_TOKEN_REVOKE: 'calendar.token.revoke',
  // Users (additional)
  USER_2FA_RESET: 'user.2fa.reset',
  // Rooms
  ROOM_CREATE: 'room.create',
  ROOM_UPDATE: 'room.update',
  ROOM_DELETE: 'room.delete',
  // Parks
  PARK_CREATE: 'park.create',
  PARK_UPDATE: 'park.update',
  PARK_DELETE: 'park.delete',
  // Companies
  COMPANY_CREATE: 'company.create',
  COMPANY_UPDATE: 'company.update',
  COMPANY_DELETE: 'company.delete',
  // Settings
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_2FA_POLICY: 'settings.2fa.policy',
  SETTINGS_BANNER: 'settings.banner',
  // Devices
  DEVICE_CREATE: 'device.create',
  DEVICE_UPDATE: 'device.update',
  DEVICE_DELETE: 'device.delete',
  DEVICE_TOKEN_REGENERATE: 'device.token.regenerate',
  // Firmware
  FIRMWARE_UPLOAD: 'firmware.upload',
  FIRMWARE_DELETE: 'firmware.delete',
  FIRMWARE_ACTIVATE: 'firmware.activate',
  // LDAP
  LDAP_CREATE: 'ldap.create',
  LDAP_UPDATE: 'ldap.update',
  LDAP_DELETE: 'ldap.delete',
  LDAP_ENABLE: 'ldap.enable',
  LDAP_DISABLE: 'ldap.disable',
  LDAP_SYNC: 'ldap.sync',
  // SSO
  SSO_CREATE: 'sso.create',
  SSO_UPDATE: 'sso.update',
  SSO_DELETE: 'sso.delete',
  SSO_ENABLE: 'sso.enable',
  SSO_DISABLE: 'sso.disable',
  // Guests (receptionist)
  GUEST_CHECKIN: 'guest.checkin',
  GUEST_CHECKOUT: 'guest.checkout',
  // System
  SYSTEM_SETUP: 'system.setup',
  // Dev
  DEV_IMPERSONATE: 'dev.impersonate',
} as const;

/**
 * Write an audit event to the audit_logs table.
 * Fire-and-forget — never throws so it cannot break the calling request.
 */
export function auditLog(event: AuditEvent): void {
  const db = getDb();
  const record = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    user_id: event.userId ?? null,
    action: event.action,
    resource_type: event.resourceType ?? null,
    resource_id: event.resourceId ?? null,
    ip_address: event.ipAddress ?? null,
    user_agent: event.userAgent ?? null,
    outcome: event.outcome,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  };

  db('audit_logs').insert(record).catch((err: unknown) => {
    console.error('Audit log write failed:', err);
  });
}

/**
 * Helper: extract IP address from an Express request, honouring the trust-proxy setting.
 */
export function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}
