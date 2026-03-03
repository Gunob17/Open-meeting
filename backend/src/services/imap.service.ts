/**
 * Per-room iMIP (iCalendar Message-Based Interoperability Protocol) booking service.
 *
 * Each room with IMAP credentials configured gets its own RoomImapWorker that
 * polls the room's dedicated inbox at a configurable interval.
 *
 * All processed emails are deleted from the server (not just marked seen) to
 * keep inboxes clean. Both accepted and rejected emails are deleted.
 *
 * iCal SEQUENCE tracking: if a booking request arrives with the same iCal UID
 * but a higher SEQUENCE number, the existing booking is updated in place rather
 * than creating a duplicate.
 *
 * Security pipeline (per email — any failure = delete + silent discard):
 *   1. Message size cap (1 MB)
 *   2. DKIM signature verification (hard gate — unsigned = discard)
 *   3. Message-ID deduplication (replay prevention)
 *   4. Parse iCal: must be METHOD=REQUEST with future DTSTART
 *   5. To:/Cc: address matches room's booking_email (sanity check)
 *   6. Sender lookup: must be active, non-deleted, same park as room
 *   7. Rate-limit: max IMAP_RATE_LIMIT_MAX per IMAP_RATE_LIMIT_WINDOW_HOURS per sender
 *   8. iCal UID lookup: new booking vs update
 *   9a. New: availability check → create → send REPLY ACCEPTED
 *   9b. Update: availability check → update booking → send REPLY ACCEPTED
 *  10. On conflict: send REPLY DECLINED
 *
 * Global environment variables (operational, not per-room credentials):
 *   IMAP_POLL_INTERVAL          Poll interval in seconds (default 120)
 *   IMAP_RATE_LIMIT_MAX         Max booking attempts per window (default 10)
 *   IMAP_RATE_LIMIT_WINDOW_HOURS  Rolling window in hours (default 1)
 */

import crypto from 'crypto';
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { dkimVerify } from 'mailauth/lib/dkim/verify';
import { getDb } from '../models/database';
import { RoomModel } from '../models/room.model';
import { UserModel } from '../models/user.model';
import { BookingModel } from '../models/booking.model';
import { MeetingRoom } from '../types';
import { parseMeetingRequest } from './ical-parser.service';
import { sendImipAccept, sendImipDecline } from './email.service';
import { auditLog, AuditAction } from './audit.service';

const MAX_EMAIL_BYTES = 1 * 1024 * 1024; // 1 MB hard cap

/** One-way truncated hash of an email address for GDPR-safe audit logging. */
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

async function isMessageIdSeen(messageId: string): Promise<boolean> {
  const db = getDb();
  const row = await db('email_dedup').where('message_id', messageId).first();
  return !!row;
}

async function markMessageIdSeen(messageId: string): Promise<void> {
  const db = getDb();
  await db('email_dedup')
    .insert({ message_id: messageId, processed_at: new Date().toISOString() })
    .onConflict('message_id')
    .ignore();
}

/** Purge dedup entries older than 30 days (housekeeping). */
async function purgeOldDedupEntries(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db('email_dedup').where('processed_at', '<', cutoff).delete();
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = parseInt(process.env.IMAP_RATE_LIMIT_MAX ?? '10', 10);
const RATE_LIMIT_WINDOW_MS =
  parseFloat(process.env.IMAP_RATE_LIMIT_WINDOW_HOURS ?? '1') * 60 * 60 * 1000;

/** Atomically check and increment the per-sender rate limit counter.
 *  Uses a DB transaction so concurrent workers cannot race the check-and-update. */
async function isRateLimited(senderEmail: string): Promise<boolean> {
  const db = getDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  return db.transaction(async (trx) => {
    const row = await trx('email_rate_limits').where('sender_email', senderEmail).first();

    if (!row) {
      await trx('email_rate_limits').insert({
        sender_email: senderEmail,
        attempt_count: 1,
        window_start: nowIso,
      });
      return false;
    }

    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
      // Window expired — reset counter and allow
      await trx('email_rate_limits').where('sender_email', senderEmail).update({
        attempt_count: 1,
        window_start: nowIso,
      });
      return false;
    }

    if (row.attempt_count >= RATE_LIMIT_MAX) {
      return true; // still within window, limit exceeded — do NOT increment
    }

    await trx('email_rate_limits').where('sender_email', senderEmail).increment('attempt_count', 1);
    return false;
  });
}

// ---------------------------------------------------------------------------
// DKIM verification
// ---------------------------------------------------------------------------

async function verifyDkim(rawBuffer: Buffer): Promise<boolean> {
  try {
    const result = await dkimVerify(rawBuffer);
    if (!result || !Array.isArray(result.results) || result.results.length === 0) {
      return false;
    }
    return result.results.some((r: any) => r?.status?.result === 'pass');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// iCal body extraction
// ---------------------------------------------------------------------------

function extractIcalText(mail: ParsedMail): string | null {
  const contentType = mail.headers?.get('content-type') as any;
  const topType = typeof contentType === 'string' ? contentType : contentType?.value;
  if (typeof topType === 'string' && topType.toLowerCase().startsWith('text/calendar')) {
    if (typeof mail.text === 'string') return mail.text;
  }

  for (const att of mail.attachments ?? []) {
    const ct = att.contentType?.toLowerCase() ?? '';
    const fn = att.filename?.toLowerCase() ?? '';
    if (ct.includes('text/calendar') || fn.endsWith('.ics')) {
      return att.content.toString('utf8');
    }
  }

  if (typeof mail.text === 'string' && mail.text.includes('BEGIN:VCALENDAR')) {
    const start = mail.text.indexOf('BEGIN:VCALENDAR');
    const end = mail.text.indexOf('END:VCALENDAR');
    if (end !== -1) {
      return mail.text.substring(start, end + 'END:VCALENDAR'.length);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main message processor
// ---------------------------------------------------------------------------

async function processMessage(rawBuffer: Buffer, room: MeetingRoom): Promise<void> {
  const prefix = `[imap:${room.name}]`;

  // 1. Size gate
  if (rawBuffer.length > MAX_EMAIL_BYTES) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_SIZE,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { size: rawBuffer.length },
    });
    return;
  }

  // 2. DKIM verification — hard gate
  const dkimPassed = await verifyDkim(rawBuffer);
  if (!dkimPassed) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_DKIM,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
    });
    return;
  }

  // Parse the email
  let mail: ParsedMail;
  try {
    mail = await simpleParser(rawBuffer);
  } catch {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_ICAL,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { reason: 'parse_failed' },
    });
    return;
  }

  // 3. Deduplication via Message-ID
  const messageId = mail.messageId;
  if (!messageId) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_DEDUP,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { reason: 'no_message_id' },
    });
    return;
  }
  if (await isMessageIdSeen(messageId)) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_DEDUP,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { messageId },
    });
    return;
  }
  await markMessageIdSeen(messageId);

  // 4. Extract and parse iCal content
  const icalText = extractIcalText(mail);
  if (!icalText) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_ICAL,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { messageId },
    });
    return;
  }

  const meeting = parseMeetingRequest(icalText);
  if (!meeting) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_ICAL,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { messageId },
    });
    return;
  }

  // 5. Sanity check: email was actually addressed to this room's booking email
  if (room.bookingEmail) {
    const toAddresses = [
      ...(mail.to ? (Array.isArray(mail.to) ? mail.to : [mail.to]) : []),
      ...(mail.cc ? (Array.isArray(mail.cc) ? mail.cc : [mail.cc]) : []),
    ]
      .flatMap(addrObj => addrObj.value ?? [])
      .map(addr => (addr.address ?? '').toLowerCase());

    if (!toAddresses.includes(room.bookingEmail.toLowerCase())) {
      auditLog({
        action: AuditAction.BOOKING_EMAIL_REJECTED_ROOM,
        resourceType: 'room',
        resourceId: room.id,
        outcome: 'failure',
        metadata: { messageId, toAddresses },
      });
      return;
    }
  }

  // 6. Sender must be an active user in the same park as the room
  const senderEmail = meeting.organizerEmail;
  const user = await UserModel.findByEmail(senderEmail);
  if (!user || !user.isActive || user.parkId !== room.parkId) {
    auditLog({
      action: AuditAction.BOOKING_EMAIL_REJECTED_USER,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { emailHash: hashEmail(senderEmail), messageId },
    });
    return;
  }

  // 7. Rate limit
  if (await isRateLimited(senderEmail)) {
    auditLog({
      userId: user.id,
      action: AuditAction.BOOKING_EMAIL_REJECTED_RATELIMIT,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { emailHash: hashEmail(senderEmail), messageId },
    });
    return;
  }

  const replyParams = {
    organizerEmail: senderEmail,
    room,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    uid: meeting.uid,
    sequence: meeting.sequence,
    title: meeting.title,
  };

  // 8. iCal UID tracking: check if this is an update to an existing booking
  const db = getDb();
  const existingUid = await db('email_uid_map').where('ical_uid', meeting.uid).first();

  if (existingUid && meeting.sequence <= existingUid.sequence) {
    // Already processed this version — silent dedup (message still gets deleted)
    return;
  }

  if (existingUid && meeting.sequence > existingUid.sequence) {
    // Guard: reject suspiciously large sequence jumps to prevent lock-out attacks
    if (meeting.sequence > existingUid.sequence + 100) {
      auditLog({
        userId: user.id,
        action: AuditAction.BOOKING_EMAIL_REJECTED_ICAL,
        resourceType: 'room',
        resourceId: room.id,
        outcome: 'failure',
        metadata: { reason: 'sequence_jump_too_large', uid: meeting.uid, messageId },
      });
      return;
    }

    // 9b. Update: modify the existing booking
    const hasConflict = await BookingModel.checkConflict(
      room.id,
      meeting.startTime,
      meeting.endTime,
      existingUid.booking_id
    );

    if (hasConflict) {
      sendImipDecline(replyParams).catch(() => undefined);
      auditLog({
        userId: user.id,
        action: AuditAction.BOOKING_EMAIL_DECLINED,
        resourceType: 'booking',
        resourceId: existingUid.booking_id,
        outcome: 'failure',
        metadata: { roomId: room.id, emailHash: hashEmail(senderEmail), messageId },
      });
      return;
    }

    try {
      const updated = await BookingModel.update(existingUid.booking_id, {
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
      });

      if (updated) {
        await db('email_uid_map').where('ical_uid', meeting.uid).update({
          sequence: meeting.sequence,
          booking_id: existingUid.booking_id,
        });

        auditLog({
          userId: user.id,
          action: AuditAction.BOOKING_EMAIL_UPDATE,
          resourceType: 'booking',
          resourceId: existingUid.booking_id,
          outcome: 'success',
          metadata: { roomId: room.id, messageId, emailHash: hashEmail(senderEmail) },
        });

        sendImipAccept(replyParams).catch(() => undefined);
      }
    } catch (err) {
      console.error(`${prefix} Failed to update booking from email:`, err);
    }
    return;
  }

  // 9a. New booking
  const hasConflict = await BookingModel.checkConflict(room.id, meeting.startTime, meeting.endTime);
  if (hasConflict) {
    sendImipDecline(replyParams).catch(() => undefined);
    auditLog({
      userId: user.id,
      action: AuditAction.BOOKING_EMAIL_DECLINED,
      resourceType: 'room',
      resourceId: room.id,
      outcome: 'failure',
      metadata: { emailHash: hashEmail(senderEmail), messageId },
    });
    return;
  }

  try {
    const booking = await BookingModel.create(
      {
        roomId: room.id,
        title: meeting.title,
        description: '',
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        attendees: [],
        externalGuests: [],
      },
      user.id
    );

    // Track the iCal UID so future updates can modify this booking
    await db('email_uid_map')
      .insert({
        ical_uid: meeting.uid,
        booking_id: booking.id,
        sequence: meeting.sequence ?? 0,
        room_id: room.id,
        created_at: new Date().toISOString(),
      })
      .onConflict('ical_uid')
      .ignore();

    auditLog({
      userId: user.id,
      action: AuditAction.BOOKING_EMAIL_CREATE,
      resourceType: 'booking',
      resourceId: booking.id,
      outcome: 'success',
      metadata: { roomId: room.id, messageId, emailHash: hashEmail(senderEmail) },
    });

    sendImipAccept(replyParams).catch(() => undefined);
  } catch (err) {
    console.error(`${prefix} Failed to create booking from email:`, err);
    // Do NOT send a decline — avoid leaking system errors to the sender
  }
}

// ---------------------------------------------------------------------------
// Per-room IMAP polling worker
// ---------------------------------------------------------------------------

export type ImapWorkerStatus = 'ok' | 'error' | 'unknown';

export interface ImapWorkerState {
  status: ImapWorkerStatus;
  lastChecked: string | null;  // ISO timestamp of last poll attempt
  lastError: string | null;    // Last error message, if any
}

class RoomImapWorker {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private state: ImapWorkerState = { status: 'unknown', lastChecked: null, lastError: null };

  getState(): ImapWorkerState {
    return { ...this.state };
  }

  constructor(private room: MeetingRoom) {}

  start(intervalMs: number): void {
    console.log(
      `[imap:${this.room.name}] Booking-by-email worker started (polling every ${intervalMs / 1000}s)`
    );
    // Run once immediately, then on interval
    this.poll();
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    if (this.polling) return; // prevent overlapping polls
    this.polling = true;
    this.fetchAndProcess()
      .then(() => {
        this.state = { status: 'ok', lastChecked: new Date().toISOString(), lastError: null };
        return purgeOldDedupEntries();
      })
      .catch(err => {
        const msg: string = err?.message ?? String(err);
        this.state = { status: 'error', lastChecked: new Date().toISOString(), lastError: msg };
        // Log extra detail so connection problems are easier to diagnose
        const detail: Record<string, unknown> = { message: msg };
        if (err?.response)             detail.response    = JSON.stringify(err.response);
        if (err?.code)                 detail.code        = err.code;
        if (err?.authenticationFailed) detail.authFailed  = true;
        if (err?.cause?.message)       detail.cause       = err.cause.message;
        if (err?.responseStatus)       detail.status      = err.responseStatus;
        console.error(`[imap:${this.room.name}] Poll error:`, JSON.stringify(detail, null, 2));
      })
      .finally(() => {
        this.polling = false;
      });
  }

  private async fetchAndProcess(): Promise<void> {
    const client = new ImapFlow({
      host: this.room.imapHost!,
      port: this.room.imapPort ?? 993,
      secure: true, // Always TLS (IMAPS)
      auth: {
        user: this.room.imapUser!,
        pass: this.room.imapPass!,
      },
      logger: false,
    });

    await client.connect();
    const uidsToDelete: number[] = [];
    try {
      const mailbox = this.room.imapMailbox ?? 'INBOX';
      const mailboxInfo = await client.mailboxOpen(mailbox);

      // Skip fetch entirely if the mailbox is empty — some servers (e.g. Hetzner/Dovecot)
      // return BAD "Invalid messageset" for FETCH 1:* on an empty mailbox.
      if (!mailboxInfo.exists || mailboxInfo.exists === 0) {
        return;
      }

      // Fetch all unseen messages
      const messages: FetchMessageObject[] = [];
      for await (const msg of client.fetch('1:*', { uid: true, source: true, flags: true })) {
        if (!msg.flags?.has('\\Seen')) {
          messages.push(msg);
        }
      }

      for (const msg of messages) {
        // Always schedule for deletion regardless of processing outcome
        uidsToDelete.push(msg.uid);
        if (!msg.source) continue;
        try {
          await processMessage(msg.source, this.room);
        } catch (err: any) {
          console.error(
            `[imap:${this.room.name}] Error processing message:`,
            err?.message ?? err
          );
        }
      }

      // Delete all processed messages to keep the inbox clean
      if (uidsToDelete.length > 0) {
        await client.messageDelete(uidsToDelete, { uid: true });
      }
    } finally {
      await client.logout();
    }
  }
}

// ---------------------------------------------------------------------------
// Worker manager — one worker per IMAP-configured room
// ---------------------------------------------------------------------------

class ImapWorkerManager {
  private workers = new Map<string, RoomImapWorker>();
  private readonly intervalMs: number;

  constructor() {
    this.intervalMs = parseInt(process.env.IMAP_POLL_INTERVAL ?? '120', 10) * 1000;
  }

  /** Load all IMAP-configured rooms and start a worker for each. */
  async start(): Promise<void> {
    const rooms = await RoomModel.findAllWithImapConfig();
    if (rooms.length === 0) {
      console.log('[imap] No rooms with IMAP configured — booking-by-email disabled');
      return;
    }
    console.log(`[imap] Starting IMAP workers for ${rooms.length} room(s)`);
    for (const room of rooms) {
      this.startWorker(room);
    }
  }

  /**
   * Stop any existing worker for a room, reload the room from DB, and start
   * a new worker if IMAP is still configured. Call after creating or updating
   * a room's IMAP credentials.
   */
  async restartRoom(roomId: string): Promise<void> {
    this.stopRoom(roomId);
    const room = await RoomModel.findById(roomId);
    if (room && room.imapHost && room.imapUser && room.imapPass) {
      this.startWorker(room);
    }
  }

  /** Stop and remove the worker for a room. */
  stopRoom(roomId: string): void {
    const worker = this.workers.get(roomId);
    if (worker) {
      worker.stop();
      this.workers.delete(roomId);
      console.log(`[imap] Worker stopped for room ${roomId}`);
    }
  }

  /** Return current connection status for all running workers, keyed by roomId. */
  getStatuses(): Record<string, ImapWorkerState> {
    const out: Record<string, ImapWorkerState> = {};
    for (const [roomId, worker] of this.workers.entries()) {
      out[roomId] = worker.getState();
    }
    return out;
  }

  /** Stop all workers (graceful shutdown). */
  stop(): void {
    for (const worker of this.workers.values()) {
      worker.stop();
    }
    this.workers.clear();
  }

  private startWorker(room: MeetingRoom): void {
    const worker = new RoomImapWorker(room);
    this.workers.set(room.id, worker);
    worker.start(this.intervalMs);
  }
}

export const imapManager = new ImapWorkerManager();
