import { Booking, BookingStatus, MeetingRoom } from '../types';

const PRODID = '-//Open Meeting//Calendar Feed//EN';

/** Converts an ISO string to the iCal DTSTART/DTEND format (UTC). */
function formatDtStamp(iso: string): string {
  // "2026-03-06T10:00:00.000Z" → "20260306T100000Z"
  return iso.replace(/[-:]/g, '').replace(/\.\d+/, '') + (iso.endsWith('Z') ? '' : 'Z');
}

/**
 * Fold long iCal lines at 75 octets per RFC 5545 §3.1.
 * Each continuation line starts with a single SPACE.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.substring(0, 75)];
  let i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.substring(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

/** Escape text values per RFC 5545 §3.3.11. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

interface FeedEvent {
  uid: string;
  dtStart: string;
  dtEnd: string;
  dtStamp: string;
  summary: string;
  location: string;
  description: string;
  status: 'CONFIRMED' | 'CANCELLED';
}

function buildVEvent(e: FeedEvent): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}@openmeeting`,
    `DTSTAMP:${e.dtStamp}`,
    `DTSTART:${e.dtStart}`,
    `DTEND:${e.dtEnd}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `STATUS:${e.status}`,
    'END:VEVENT',
  ];
  return lines.map(foldLine).join('\r\n');
}

/**
 * Generate a VCALENDAR ICS feed for all bookings in a single room.
 *
 * Privacy rules:
 * - Bookings belonging to ownerUserId show their full title.
 * - All other bookings are anonymized to "Booked".
 * - Attendee email addresses are never included.
 * - CANCELLED bookings are included with STATUS:CANCELLED so calendar clients
 *   can tombstone removed events on the next sync.
 */
export function generateRoomFeed(
  room: MeetingRoom,
  bookings: Booking[],
  ownerUserId: string,
): string {
  const dtStamp = formatDtStamp(new Date().toISOString());
  const location = `${room.name}, ${room.floor}, ${room.address}`;

  const vevents = bookings.map((b) => {
    const isOwner = b.userId === ownerUserId;
    const status = b.status === BookingStatus.CANCELLED ? 'CANCELLED' : 'CONFIRMED';
    return buildVEvent({
      uid: b.id,
      dtStart: formatDtStamp(b.startTime),
      dtEnd: formatDtStamp(b.endTime),
      dtStamp,
      summary: isOwner ? b.title : 'Booked',
      location,
      description: isOwner ? (b.description || '') : '',
      status,
    });
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(room.name)}`),
    'X-WR-CALDESC:Room bookings from Open Meeting',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Generate a VCALENDAR ICS feed aggregating all enabled rooms in a park.
 *
 * Privacy rules identical to generateRoomFeed:
 * - Token owner's bookings show full title; all others show "Booked".
 * - Each event's LOCATION includes the room name so the user knows which room is booked.
 */
export function generateParkFeed(
  parkName: string,
  rooms: MeetingRoom[],
  bookingsByRoom: Map<string, Booking[]>,
  ownerUserId: string,
): string {
  const dtStamp = formatDtStamp(new Date().toISOString());

  const vevents: string[] = [];
  for (const room of rooms) {
    const location = `${room.name}, ${room.floor}, ${room.address}`;
    for (const b of bookingsByRoom.get(room.id) ?? []) {
      const isOwner = b.userId === ownerUserId;
      const status = b.status === BookingStatus.CANCELLED ? 'CANCELLED' : 'CONFIRMED';
      vevents.push(buildVEvent({
        uid: b.id,
        dtStart: formatDtStamp(b.startTime),
        dtEnd: formatDtStamp(b.endTime),
        dtStamp,
        summary: isOwner ? b.title : 'Booked',
        location,
        description: isOwner ? (b.description || '') : '',
        status,
      }));
    }
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(parkName + ' – All Rooms')}`),
    'X-WR-CALDESC:All room bookings from Open Meeting',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Generate a VCALENDAR ICS feed for a user's own bookings across all rooms.
 * Shows full booking detail since this feed is scoped to the owner.
 */
export function generateMyBookingsFeed(
  userName: string,
  bookings: Booking[],
  roomMap: Map<string, MeetingRoom>,
): string {
  const dtStamp = formatDtStamp(new Date().toISOString());

  const vevents = bookings.map((b) => {
    const room = roomMap.get(b.roomId);
    const location = room
      ? `${room.name}, ${room.floor}, ${room.address}`
      : 'Unknown Room';
    const status = b.status === BookingStatus.CANCELLED ? 'CANCELLED' : 'CONFIRMED';

    return buildVEvent({
      uid: b.id,
      dtStart: formatDtStamp(b.startTime),
      dtEnd: formatDtStamp(b.endTime),
      dtStamp,
      summary: b.title,
      location,
      description: b.description || '',
      status,
    });
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(userName + "'s Bookings")}`),
    'X-WR-CALDESC:My bookings from Open Meeting',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}
