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
    const amenitiesText = amenities.length > 0 ? `<p><strong>Amenities:</strong> ${amenities.join(', ')}</p>` : '';

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
      <p style="margin: 10px 0 0 0;">${booking.title}</p>
    </div>
    <div class="content">
      <p>You have been invited to a meeting by <strong>${organizer.name}</strong>.</p>

      <div class="details">
        <div class="detail-row">
          <span class="label">Date:</span> ${startTime.toLocaleDateString('en-US', dateOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Time:</span> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Room:</span> ${room.name}
        </div>
        <div class="detail-row">
          <span class="label">Floor:</span> ${room.floor}
        </div>
        <div class="detail-row">
          <span class="label">Capacity:</span> ${room.capacity} people
        </div>
        ${amenitiesText}
        <div class="detail-row">
          <span class="label">Address:</span><br>
          ${room.address}
        </div>
      </div>

      ${booking.description ? `<p><strong>Description:</strong><br>${booking.description}</p>` : ''}

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
      <p><strong>${booking.title}</strong></p>
      <p>Originally scheduled for: ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
      <p>Room: ${room.name}</p>
      <p>Cancelled by: ${organizer.name}</p>
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
        <p><strong>Meeting:</strong> ${booking.title}</p>
        <p><strong>Date:</strong> ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
        <p><strong>Time:</strong> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}</p>
        <p><strong>Room:</strong> ${room.name}</p>
      </div>

      ${reason ? `<div class="reason"><p><strong>Reason:</strong> ${reason}</p></div>` : ''}

      <p>Deleted by: ${admin.name} (${admin.email})</p>

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
        <p><strong>Meeting:</strong> ${booking.title}</p>
        <p><strong>Date:</strong> ${startTime.toLocaleDateString('en-US', dateOptions)}</p>
        <p><strong>Time:</strong> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}</p>
      </div>

      <div class="room-change">
        <div class="old-room">${oldRoom.name}<br><small>${oldRoom.floor}</small></div>
        <span class="arrow">→</span>
        <div class="new-room">${newRoom.name}<br><small>${newRoom.floor}</small></div>
      </div>

      ${reason ? `<div class="reason"><p><strong>Reason:</strong> ${reason}</p></div>` : ''}

      <p>Changed by: ${admin.name} (${admin.email})</p>

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
      let cells = `<td style="padding: 8px; border: 1px solid #e5e7eb;">${guest.name}</td>`;
      if (showEmail) {
        cells += `<td style="padding: 8px; border: 1px solid #e5e7eb;">${guest.email || '-'}</td>`;
      }
      if (showCompany) {
        cells += `<td style="padding: 8px; border: 1px solid #e5e7eb;">${guest.company || '-'}</td>`;
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
      <p>An upcoming meeting at <strong>${parkName}</strong> will include external guests. Please prepare the necessary guest passes.</p>

      <div class="details">
        <div class="detail-row">
          <span class="label">Meeting:</span> ${booking.title}
        </div>
        <div class="detail-row">
          <span class="label">Date:</span> ${startTime.toLocaleDateString('en-US', dateOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Time:</span> ${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}
        </div>
        <div class="detail-row">
          <span class="label">Room:</span> ${room.name} (${room.floor})
        </div>
        <div class="detail-row">
          <span class="label">Organizer:</span> ${organizer.name} (${organizer.email})
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

      ${booking.description ? `<p><strong>Meeting Description:</strong><br>${booking.description}</p>` : ''}

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
