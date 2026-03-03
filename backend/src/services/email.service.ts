import nodemailer from 'nodemailer';
import { createEvent, EventAttributes } from 'ics';
import { Booking, MeetingRoom, User, ExternalGuest } from '../types';

// Strict email validation to prevent header injection
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254 && !email.includes('\n') && !email.includes('\r');
}

function sanitizeEmails(emails: string[]): string[] {
  return emails.filter(e => e && isValidEmail(e));
}

/** Escape user-supplied strings before embedding them in HTML email bodies. */
function htmlEscape(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Configure transporter - use environment variables in production
const isProduction = process.env.NODE_ENV === 'production';
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || (isProduction ? undefined : 'test@ethereal.email'),
    pass: process.env.SMTP_PASS || (isProduction ? undefined : 'testpassword'),
  },
  logger: !isProduction,
  debug: !isProduction,
});

/**
 * Returns a per-room SMTP transporter for iMIP replies if the room has IMAP
 * credentials configured. The IMAP host/user/pass are reused for SMTP — most
 * mail providers (Hetzner, etc.) use the same credentials for both.
 * Falls back to the global transporter if no room credentials are available.
 */
function getSmtpTransporterForRoom(room: MeetingRoom): {
  mailer: nodemailer.Transporter;
  from: string;
} {
  if (room.imapHost && room.imapUser && room.imapPass) {
    const host = room.smtpHost ?? room.imapHost;
    const port = room.smtpPort ?? 587;
    const secure = room.smtpSecure ?? false;
    const mailer = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: room.imapUser, pass: room.imapPass },
    });
    // Send from the room's booking address so the reply lands in the organizer's calendar
    const from = room.bookingEmail
      ? `"${room.name}" <${room.bookingEmail}>`
      : room.imapUser;
    return { mailer, from };
  }
  // Fallback: use the global transporter and configured FROM address
  return {
    mailer: transporter,
    from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
  };
}

interface MeetingInviteParams {
  booking: Booking;
  room: MeetingRoom;
  organizer: Omit<User, 'password'>;
  attendeeEmails: string[];
}

function parseDateTime(isoString: string): [number, number, number, number, number] {
  const date = new Date(isoString);
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes()
  ];
}

function getDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

export async function generateICSContent(params: MeetingInviteParams): Promise<string> {
  const { booking, room, organizer, attendeeEmails } = params;

  const amenities = JSON.parse(room.amenities) as string[];
  const amenitiesText = amenities.length > 0 ? `\nAmenities: ${amenities.join(', ')}` : '';

  const event: EventAttributes = {
    start: parseDateTime(booking.startTime),
    end: parseDateTime(booking.endTime),
    title: booking.title,
    description: `${booking.description || 'Meeting'}

Room: ${room.name}
Floor: ${room.floor}
Capacity: ${room.capacity} people${amenitiesText}

Address: ${room.address}

Organizer: ${organizer.name} (${organizer.email})`,
    location: `${room.name}, ${room.floor}, ${room.address}`,
    organizer: { name: organizer.name, email: organizer.email },
    attendees: attendeeEmails.map(email => ({
      email,
      rsvp: true,
      partstat: 'NEEDS-ACTION' as const,
      role: 'REQ-PARTICIPANT' as const
    })),
    uid: booking.id,
    sequence: 0,
    status: 'CONFIRMED' as const,
    busyStatus: 'BUSY' as const,
    productId: 'Open Meeting System'
  };

  return new Promise((resolve, reject) => {
    createEvent(event, (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

export async function sendMeetingInvite(params: MeetingInviteParams): Promise<void> {
  const { booking, room, organizer, attendeeEmails } = params;

  if (attendeeEmails.length === 0 && !organizer.email) {
    console.log('No recipients for meeting invite');
    return;
  }

  try {
    const icsContent = await generateICSContent(params);
    const amenities = JSON.parse(room.amenities) as string[];
    const amenitiesText = amenities.length > 0 ? `<p><strong>Amenities:</strong> ${amenities.map(htmlEscape).join(', ')}</p>` : '';

    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4f46e5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .detail-row { margin: 10px 0; }
    .label { font-weight: bold; color: #6b7280; }
    .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Meeting Invitation</h1>
      <p style="margin: 10px 0 0 0;">${htmlEscape(booking.title)}</p>
    </div>
    <div class="content">
      <p>You have been invited to a meeting by <strong>${htmlEscape(organizer.name)}</strong>.</p>

      <div class="details">
        <div class="detail-row">
          <span class="label">Date:</span> ${startTime.toLocaleDateString('en-US', dateOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Time:</span> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Room:</span> ${htmlEscape(room.name)}
        </div>
        <div class="detail-row">
          <span class="label">Floor:</span> ${htmlEscape(room.floor)}
        </div>
        <div class="detail-row">
          <span class="label">Capacity:</span> ${room.capacity} people
        </div>
        ${amenitiesText}
        <div class="detail-row">
          <span class="label">Address:</span><br>
          ${htmlEscape(room.address)}
        </div>
      </div>

      ${booking.description ? `<p><strong>Description:</strong><br>${htmlEscape(booking.description)}</p>` : ''}

      <p class="footer">
        This invitation was sent from Open Meeting.<br>
        Please add the attached .ics file to your calendar.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const allRecipients = sanitizeEmails([organizer.email, ...attendeeEmails]);
    if (allRecipients.length === 0) return;

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
      to: allRecipients.join(', '),
      subject: `Meeting Invitation: ${booking.title}`,
      html: htmlContent,
      icalEvent: {
        filename: 'meeting.ics',
        method: 'REQUEST',
        content: icsContent
      },
      attachments: [
        {
          filename: 'meeting.ics',
          content: icsContent,
          contentType: 'text/calendar'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`Meeting invite sent to: ${allRecipients.join(', ')}`);
  } catch (error) {
    console.error('Failed to send meeting invite:', error);
    // Don't throw - email failure shouldn't fail the booking
  }
}

export async function sendCancellationNotice(params: MeetingInviteParams): Promise<void> {
  const { booking, room, organizer, attendeeEmails } = params;

  if (attendeeEmails.length === 0 && !organizer.email) {
    return;
  }

  try {
    const startTime = new Date(booking.startTime);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Meeting Cancelled</h1>
    </div>
    <div class="content">
      <p>The following meeting has been cancelled:</p>
      <p><strong>${htmlEscape(booking.title)}</strong></p>
      <p>Originally scheduled for: ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
      <p>Room: ${htmlEscape(room.name)}</p>
      <p>Cancelled by: ${htmlEscape(organizer.name)}</p>
    </div>
  </div>
</body>
</html>
    `;

    const allRecipients = sanitizeEmails([organizer.email, ...attendeeEmails]);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
      to: allRecipients.join(', '),
      subject: `Meeting Cancelled: ${booking.title}`,
      html: htmlContent
    });

    console.log(`Cancellation notice sent to: ${allRecipients.join(', ')}`);
  } catch (error) {
    console.error('Failed to send cancellation notice:', error);
  }
}

interface AdminActionParams {
  booking: Booking;
  room: MeetingRoom;
  bookingOwner: Omit<User, 'password'>;
  admin: Omit<User, 'password'>;
  attendeeEmails: string[];
  reason?: string;
}

export async function sendAdminDeleteNotice(params: AdminActionParams): Promise<void> {
  const { booking, room, bookingOwner, admin, attendeeEmails, reason } = params;

  if (!bookingOwner.email) {
    return;
  }

  try {
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .reason { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Meeting Deleted by Administrator</h1>
    </div>
    <div class="content">
      <p>Your meeting has been deleted by a system administrator.</p>

      <div class="details">
        <p><strong>Meeting:</strong> ${htmlEscape(booking.title)}</p>
        <p><strong>Date:</strong> ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
        <p><strong>Time:</strong> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}</p>
        <p><strong>Room:</strong> ${htmlEscape(room.name)}</p>
      </div>

      ${reason ? `<div class="reason"><p><strong>Reason:</strong> ${htmlEscape(reason)}</p></div>` : ''}

      <p>Deleted by: ${htmlEscape(admin.name)} (${htmlEscape(admin.email)})</p>

      <p>If you have any questions, please contact the administrator.</p>
    </div>
  </div>
</body>
</html>
    `;

    const allRecipients = [bookingOwner.email, ...attendeeEmails].filter(Boolean);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
      to: allRecipients.join(', '),
      subject: `Meeting Deleted: ${booking.title}`,
      html: htmlContent
    });

    console.log(`Admin delete notice sent to: ${allRecipients.join(', ')}`);
  } catch (error) {
    console.error('Failed to send admin delete notice:', error);
  }
}

interface ReceptionNotificationParams {
  booking: Booking;
  room: MeetingRoom;
  organizer: Omit<User, 'password'>;
  externalGuests: ExternalGuest[];
  receptionEmail: string;
  parkName: string;
  guestFields: string[];
}

interface AdminMoveParams extends AdminActionParams {
  oldRoom: MeetingRoom;
  newRoom: MeetingRoom;
}

export async function sendAdminMoveNotice(params: AdminMoveParams): Promise<void> {
  const { booking, oldRoom, newRoom, bookingOwner, admin, attendeeEmails, reason } = params;

  if (!bookingOwner.email) {
    return;
  }

  try {
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .room-change { display: flex; align-items: center; gap: 10px; margin: 15px 0; }
    .old-room { background: #fee2e2; padding: 10px; border-radius: 8px; text-decoration: line-through; }
    .new-room { background: #dcfce7; padding: 10px; border-radius: 8px; font-weight: bold; }
    .arrow { font-size: 24px; color: #6b7280; }
    .reason { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Meeting Room Changed</h1>
    </div>
    <div class="content">
      <p>Your meeting has been moved to a different room by a system administrator.</p>

      <div class="details">
        <p><strong>Meeting:</strong> ${htmlEscape(booking.title)}</p>
        <p><strong>Date:</strong> ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
        <p><strong>Time:</strong> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}</p>
      </div>

      <div class="room-change">
        <div class="old-room">${htmlEscape(oldRoom.name)}<br><small>${htmlEscape(oldRoom.floor)}</small></div>
        <span class="arrow">→</span>
        <div class="new-room">${htmlEscape(newRoom.name)}<br><small>${htmlEscape(newRoom.floor)}</small></div>
      </div>

      ${reason ? `<div class="reason"><p><strong>Reason:</strong> ${htmlEscape(reason)}</p></div>` : ''}

      <p>Changed by: ${htmlEscape(admin.name)} (${htmlEscape(admin.email)})</p>

      <p>If you have any questions, please contact the administrator.</p>
    </div>
  </div>
</body>
</html>
    `;

    const allRecipients = [bookingOwner.email, ...attendeeEmails].filter(Boolean);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
      to: allRecipients.join(', '),
      subject: `Meeting Room Changed: ${booking.title}`,
      html: htmlContent
    });

    console.log(`Admin move notice sent to: ${allRecipients.join(', ')}`);
  } catch (error) {
    console.error('Failed to send admin move notice:', error);
  }
}

export async function sendReceptionNotification(params: ReceptionNotificationParams): Promise<void> {
  const { booking, room, organizer, externalGuests, receptionEmail, parkName, guestFields } = params;

  if (!receptionEmail || externalGuests.length === 0) {
    return;
  }

  try {
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };

    const showEmail = guestFields.includes('email');
    const showCompany = guestFields.includes('company');

    // Build table headers based on configured fields
    let headerCells = '<th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left; background: #f3f4f6;">Name</th>';
    if (showEmail) {
      headerCells += '<th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left; background: #f3f4f6;">Email</th>';
    }
    if (showCompany) {
      headerCells += '<th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left; background: #f3f4f6;">Company / Organization</th>';
    }

    // Build table rows based on configured fields
    const guestRows = externalGuests.map(guest => {
      let cells = `<td style="padding: 8px; border: 1px solid #e5e7eb;">${htmlEscape(guest.name)}</td>`;
      if (showEmail) {
        cells += `<td style="padding: 8px; border: 1px solid #e5e7eb;">${htmlEscape(guest.email) || '-'}</td>`;
      }
      if (showCompany) {
        cells += `<td style="padding: 8px; border: 1px solid #e5e7eb;">${htmlEscape(guest.company) || '-'}</td>`;
      }
      return `<tr>${cells}</tr>`;
    }).join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .detail-row { margin: 10px 0; }
    .label { font-weight: bold; color: #6b7280; }
    .guest-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">External Guest Notification</h1>
      <p style="margin: 10px 0 0 0;">Guest passes may be required</p>
    </div>
    <div class="content">
      <p>An upcoming meeting at <strong>${htmlEscape(parkName)}</strong> will include external guests. Please prepare the necessary guest passes.</p>

      <div class="details">
        <div class="detail-row">
          <span class="label">Meeting:</span> ${htmlEscape(booking.title)}
        </div>
        <div class="detail-row">
          <span class="label">Date:</span> ${startTime.toLocaleDateString('en-US', dateOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Time:</span> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Room:</span> ${htmlEscape(room.name)} (${htmlEscape(room.floor)})
        </div>
        <div class="detail-row">
          <span class="label">Organizer:</span> ${htmlEscape(organizer.name)} (${htmlEscape(organizer.email)})
        </div>
      </div>

      <h3>External Guests (${externalGuests.length})</h3>
      <table class="guest-table">
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${guestRows}
        </tbody>
      </table>

      ${booking.description ? `<p><strong>Meeting Description:</strong><br>${htmlEscape(booking.description)}</p>` : ''}

      <p class="footer">
        This notification was sent automatically from Open Meeting.<br>
        Please ensure guest passes are prepared before the meeting time.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
      to: receptionEmail,
      subject: `External Guest Notification: ${booking.title} - ${startTime.toLocaleDateString('en-US', dateOptions)}`,
      html: htmlContent
    });

    console.log(`Reception notification sent to: ${receptionEmail}`);
  } catch (error) {
    console.error('Failed to send reception notification:', error);
    // Don't throw - email failure shouldn't fail the booking
  }
}

// ---------------------------------------------------------------------------
// iMIP: booking-by-email reply functions
// ---------------------------------------------------------------------------

interface ImipReplyParams {
  /** Organizer email — where the reply is sent */
  organizerEmail: string;
  /** Room that received the invite */
  room: MeetingRoom;
  /** Meeting start (ISO) */
  startTime: string;
  /** Meeting end (ISO) */
  endTime: string;
  /** iCal UID from the original REQUEST */
  uid: string;
  /** SEQUENCE from the original REQUEST */
  sequence: number;
  /** Meeting title from the original REQUEST (already sanitized) */
  title: string;
}

/** Build a minimal iCal REPLY string (PARTSTAT=ACCEPTED or DECLINED). */
function buildImipReply(params: ImipReplyParams, accepted: boolean): string {
  const roomEmail = (params.room.bookingEmail ?? '').toLowerCase();
  const partstat = accepted ? 'ACCEPTED' : 'DECLINED';
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtStart = params.startTime.replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtEnd   = params.endTime.replace(/[-:]/g, '').split('.')[0] + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Open Meeting//EN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `SEQUENCE:${params.sequence}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `ORGANIZER:MAILTO:${params.organizerEmail}`,
    `ATTENDEE;PARTSTAT=${partstat};RSVP=FALSE:MAILTO:${roomEmail}`,
    `STATUS:${accepted ? 'CONFIRMED' : 'DECLINED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Send an iCal REPLY ACCEPTED to the organizer when a booking-by-email
 * succeeds.  Uses a fixed template — no user-supplied content in subject.
 */
export async function sendImipAccept(params: ImipReplyParams): Promise<void> {
  if (!isValidEmail(params.organizerEmail)) return;

  const startTime = new Date(params.startTime);
  const endTime   = new Date(params.endTime);
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  };
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  const icsContent = buildImipReply(params, true);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .detail-row { margin: 10px 0; }
    .label { font-weight: bold; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">Booking Confirmed</h1>
    </div>
    <div class="content">
      <p>Your booking request for <strong>${htmlEscape(params.room.name)}</strong> has been confirmed.</p>
      <div class="details">
        <div class="detail-row"><span class="label">Room:</span> ${htmlEscape(params.room.name)}</div>
        <div class="detail-row"><span class="label">Date:</span> ${startTime.toLocaleDateString('en-US', dateOptions)}</div>
        <div class="detail-row"><span class="label">Time:</span> ${startTime.toLocaleTimeString('en-US', timeOptions)} &ndash; ${endTime.toLocaleTimeString('en-US', timeOptions)}</div>
        <div class="detail-row"><span class="label">Floor:</span> ${htmlEscape(params.room.floor)}</div>
        <div class="detail-row"><span class="label">Address:</span> ${htmlEscape(params.room.address)}</div>
      </div>
      <p style="font-size:12px;color:#9ca3af;">This confirmation was sent automatically from Open Meeting. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const { mailer, from } = getSmtpTransporterForRoom(params.room);
    await mailer.sendMail({
      from,
      to: params.organizerEmail,
      subject: `Room Booking Confirmed: ${params.room.name}`,
      html,
      icalEvent: { filename: 'reply.ics', method: 'REPLY', content: icsContent },
      attachments: [{ filename: 'reply.ics', content: icsContent, contentType: 'text/calendar' }],
    });
    console.log(`iMIP ACCEPT sent to ${params.organizerEmail}`);
  } catch (err) {
    console.error('Failed to send iMIP accept:', err);
  }
}

/**
 * Send an iCal REPLY DECLINED to the organizer when the requested slot is
 * unavailable.  The message is intentionally generic to avoid revealing system
 * state (no distinction between "busy" and any other decline reason).
 */
export async function sendImipDecline(params: ImipReplyParams): Promise<void> {
  if (!isValidEmail(params.organizerEmail)) return;

  const icsContent = buildImipReply(params, false);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">Booking Request Declined</h1>
    </div>
    <div class="content">
      <p>Your booking request for <strong>${htmlEscape(params.room.name)}</strong> could not be fulfilled.</p>
      <p>The room is not available at the requested time. Please choose a different time slot and try again, or book through the Open Meeting portal.</p>
      <p style="font-size:12px;color:#9ca3af;">This message was sent automatically from Open Meeting. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const { mailer, from } = getSmtpTransporterForRoom(params.room);
    await mailer.sendMail({
      from,
      to: params.organizerEmail,
      subject: `Booking Request Declined: ${params.room.name}`,
      html,
      icalEvent: { filename: 'reply.ics', method: 'REPLY', content: icsContent },
      attachments: [{ filename: 'reply.ics', content: icsContent, contentType: 'text/calendar' }],
    });
    console.log(`iMIP DECLINE sent to ${params.organizerEmail}`);
  } catch (err) {
    console.error('Failed to send iMIP decline:', err);
  }
}

export async function sendUserInviteEmail(toEmail: string, inviteLink: string): Promise<void> {
  if (!isValidEmail(toEmail)) {
    console.error('Invalid email address for invite:', toEmail);
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6366f1; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .btn { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">You've been invited to Open Meeting</h1>
    </div>
    <div class="content">
      <p>An administrator has created an account for you on Open Meeting, a room booking system.</p>
      <p>Click the button below to set up your name and password and activate your account:</p>
      <a href="${inviteLink}" class="btn">Complete Account Setup</a>
      <p>This invitation link expires in <strong>48 hours</strong>.</p>
      <p>If you did not expect this invitation, you can safely ignore this email.</p>
      <p class="footer">This email was sent automatically from Open Meeting. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Open Meeting" <noreply@openmeeting.com>',
    to: toEmail,
    subject: "You've been invited to Open Meeting",
    html: htmlContent,
  });

  console.log(`Invite email sent to: ${toEmail}`);
}
