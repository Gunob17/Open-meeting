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
