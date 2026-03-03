/**
 * iCal parser for inbound booking-by-email (iMIP).
 *
 * Extracts the fields we need from a raw RFC-5545 iCalendar object that
 * arrived as part of an email.  We intentionally reject anything that is not
 * a well-formed REQUEST with a future DTSTART; all error paths return null so
 * the caller can silently discard the message.
 */

import * as nodeIcal from 'node-ical';

export interface ParsedMeetingRequest {
  /** Organizer email (from:) – already lower-cased */
  organizerEmail: string;
  /** Meeting start – UTC ISO string */
  startTime: string;
  /** Meeting end – UTC ISO string */
  endTime: string;
  /** Meeting title / subject */
  title: string;
  /** iCal UID – used for deduplication and reply generation */
  uid: string;
  /** SEQUENCE number (0 if absent) */
  sequence: number;
}

const MAX_ICAL_BYTES = 512 * 1024; // 512 KB hard cap for iCal body

/**
 * Parse a raw iCal string extracted from an email body or attachment.
 *
 * Returns null if:
 *  - the string is too large
 *  - parsing throws
 *  - METHOD is not REQUEST
 *  - no VEVENT component found
 *  - DTSTART is missing or in the past
 *  - ORGANIZER email is missing
 */
export function parseMeetingRequest(rawIcal: string): ParsedMeetingRequest | null {
  try {
    if (Buffer.byteLength(rawIcal, 'utf8') > MAX_ICAL_BYTES) {
      return null;
    }

    // Synchronous parse (node-ical.sync.parseICS)
    const parsed = nodeIcal.sync.parseICS(rawIcal);

    // Confirm this is a REQUEST (booking invite) at the calendar level
    const calendarMethod = extractCalendarMethod(rawIcal);
    if (calendarMethod && calendarMethod.toUpperCase() !== 'REQUEST') {
      return null; // REPLY, CANCEL, etc. — ignore
    }

    // Find the VEVENT
    let vevent: nodeIcal.VEvent | null = null;
    for (const key of Object.keys(parsed)) {
      const comp = parsed[key];
      if (comp && comp.type === 'VEVENT') {
        vevent = comp as nodeIcal.VEvent;
        break;
      }
    }
    if (!vevent) return null;

    // DTSTART is required and must be in the future
    if (!vevent.start) return null;
    const startDate = new Date(vevent.start);
    if (isNaN(startDate.getTime())) return null;
    if (startDate.getTime() <= Date.now()) return null; // past booking

    // DTEND is required
    if (!vevent.end) return null;
    const endDate = new Date(vevent.end);
    if (isNaN(endDate.getTime())) return null;
    if (endDate.getTime() <= startDate.getTime()) return null;

    // UID is required
    const uid = typeof vevent.uid === 'string' ? vevent.uid.trim() : null;
    if (!uid) return null;

    // ORGANIZER email
    const organizerEmail = extractOrganizerEmail(vevent);
    if (!organizerEmail) return null;

    // SUMMARY (title) — sanitized to prevent injection
    const rawSummary = typeof vevent.summary === 'string' ? vevent.summary : '';
    const title = sanitizeField(rawSummary) || 'Meeting';

    // SEQUENCE must be a non-negative integer within a sane range.
    // An attacker could send SEQUENCE=999999 to permanently block future updates
    // for a given UID (any legitimate update would need a higher sequence).
    const rawSeq = typeof vevent.sequence === 'number' ? vevent.sequence : 0;
    if (rawSeq < 0 || rawSeq > 32767) return null;
    const sequence = rawSeq;

    return {
      organizerEmail,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      title,
      uid,
      sequence,
    };
  } catch {
    return null;
  }
}

/** Extract METHOD value from the raw iCal text (before full parsing). */
function extractCalendarMethod(raw: string): string | null {
  const match = /^METHOD:(.+)$/im.exec(raw);
  return match ? match[1].trim() : null;
}

/**
 * Extract the organizer's email from the VEVENT ORGANIZER property.
 * The ORGANIZER value is typically "MAILTO:user@example.com".
 */
function extractOrganizerEmail(vevent: nodeIcal.VEvent): string | null {
  const organizer = (vevent as any).organizer;
  if (!organizer) return null;

  let raw: string | null = null;
  if (typeof organizer === 'string') {
    raw = organizer;
  } else if (typeof organizer === 'object' && organizer.val) {
    raw = String(organizer.val);
  }

  if (!raw) return null;
  const email = raw.replace(/^MAILTO:/i, '').trim().toLowerCase();

  // Basic sanity check — must look like an email
  if (!email.includes('@') || email.includes('\n') || email.includes('\r') || email.length > 254) {
    return null;
  }
  return email;
}

/**
 * Strip control characters and limit length to prevent injection in
 * response emails.
 */
function sanitizeField(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .substring(0, 255)
    .trim();
}
