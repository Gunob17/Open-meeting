import nodemailer from 'nodemailer';
import { createEvent, EventAttributes } from 'ics';
import { Booking, MeetingRoom, User } from '../types';

// Configure transporter - use environment variables in production
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'test@ethereal.email',
    pass: process.env.SMTP_PASS || 'testpassword'
  }
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
    productId: 'Meeting Room Booking System'
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
        This invitation was sent from the Meeting Room Booking System.<br>
        Please add the attached .ics file to your calendar.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const allRecipients = [organizer.email, ...attendeeEmails].filter(Boolean);

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Meeting Room Booking" <noreply@meetingbooking.com>',
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

    const allRecipients = [organizer.email, ...attendeeEmails].filter(Boolean);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Meeting Room Booking" <noreply@meetingbooking.com>',
      to: allRecipients.join(', '),
      subject: `Meeting Cancelled: ${booking.title}`,
      html: htmlContent
    });

    console.log(`Cancellation notice sent to: ${allRecipients.join(', ')}`);
  } catch (error) {
    console.error('Failed to send cancellation notice:', error);
  }
}
