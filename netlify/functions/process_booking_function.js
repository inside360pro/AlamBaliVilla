const { google } = require('googleapis');
const { Resend } = require('resend');

function getPrivateKey() {
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!key) return '';
  key = key.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

const CALENDAR_MAP = {
  1: process.env.CALENDAR_ID_VILLA1,
  2: process.env.CALENDAR_ID_VILLA2,
  3: process.env.CALENDAR_ID_VILLA3
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const formattedKey = getPrivateKey();
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    if (!serviceAccountEmail || !formattedKey) {
      throw new Error('Missing Google Service Account environment variables.');
    }

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const data = JSON.parse(event.body || '{}');
    const {
      firstName,
      lastName,
      email,
      whatsapp,
      roomNumber,
      checkIn,
      checkOut,
      nights,
      guests,
      addOns = [],
      wineSelection,
      specialRequests
    } = data;

    const guestFullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Valued Guest';
    const calendarId = CALENDAR_MAP[Number(roomNumber)] || CALENDAR_MAP[roomNumber];

    if (!calendarId) {
      throw new Error(`Calendar ID for Deluxe Suite ${roomNumber} is missing in Netlify environment variables.`);
    }

    const summary = `PENDING REQUEST: ${guestFullName} (Deluxe Suite ${roomNumber})`;
    const descriptionLines = [
      `GUEST DETAILS:`,
      `• Name: ${guestFullName}`,
      `• Email: ${email || 'Not provided'}`,
      `• WhatsApp: ${whatsapp || 'Not provided'}`,
      `• Party: ${guests?.adults || 1} Adults, ${guests?.children || 0} Children, ${guests?.pets || 0} Pets`,
      `• Stay Range: ${checkIn} to ${checkOut} (${nights || ''})`,
      ``,
      `BESPOKE OPTIONS & ADD-ONS:`,
      ...(addOns.length > 0 ? addOns.map(a => `• ${a}`) : ['• None']),
      wineSelection ? `• Fine Wines / Champagne: ${wineSelection}` : null,
      ``,
      `ADDITIONAL REQUIREMENTS:`,
      specialRequests || '• None'
    ].filter(Boolean);

    const description = descriptionLines.join('\n');

    const calendarEvent = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: {
        summary: summary,
        description: description,
        start: { date: checkIn },
        end: { date: checkOut },
        colorId: '5'
      }
    });

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const villaHostEmail = 'alambalivilla.indo@gmail.com';

      await resend.emails.send({
        from: 'Alam Bali Villa <bookings@alambalivilla.app>',
        to: [villaHostEmail],
        reply_to: email || villaHostEmail,
        subject: `New Request: ${guestFullName} (Deluxe Suite ${roomNumber})`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 24px; color: #1f1f1f; background-color: #f9f9f9;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e0e0e0;">
              <h2 style="color: #D4AF37; margin-top: 0;">New Reservation Request</h2>
              <p><strong>Guest Name:</strong> ${guestFullName}</p>
              <p><strong>Suite:</strong> Deluxe Suite ${roomNumber}</p>
              <p><strong>Dates:</strong> ${checkIn} to ${checkOut} (${nights || ''})</p>
              <p><strong>Contact:</strong> ${email || 'No email'} | ${whatsapp || 'No WhatsApp'}</p>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
              <p style="white-space: pre-line; color: #444444; font-size: 13px;">${description}</p>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
              <p><a href="${calendarEvent.data.htmlLink}" style="display: inline-block; background-color: #D4AF37; color: #141414; font-weight: bold; padding: 10px 18px; text-decoration: none; border-radius: 4px;">View Event in Google Calendar</a></p>
            </div>
          </div>
        `
      }).catch(err => console.error('Host Notification Email Error:', err));

      if (email) {
        await resend.emails.send({
          from: 'Alam Bali Villa <reservations@alambalivilla.app>',
          to: [email],
          subject: 'Your Sanctuary Booking Request - Alam Bali Villa',
          html: `
            <div style="font-family: 'Times New Roman', serif; padding: 32px; background-color: #141414; color: #ffffff; line-height: 1.6;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #D4AF37; letter-spacing: 3px; text-transform: uppercase; margin: 0;">Alam Bali Villa</h1>
                <p style="color: #aaaaaa; font-size: 11px; letter-spacing: 2px; margin-top: 4px;">ULTRA-LUXURY PRIVATE SANCTUARY</p>
              </div>
              <p>Dear ${firstName || 'Guest'},</p>
              <p>Thank you for placing a reservation request for <strong>Deluxe Suite ${roomNumber}</strong> from <strong>${checkIn}</strong> to <strong>${checkOut}</strong>.</p>
              <div style="border: 1px solid #D4AF37; padding: 20px; margin: 24px 0; background-color: #1f1f1f; border-radius: 6px;">
                <h3 style="color: #D4AF37; margin-top: 0; font-size: 16px;">Reservation Details</h3>
                <p style="margin: 6px 0; font-size: 13px;"><strong>Suite Quarter:</strong> Deluxe Suite ${roomNumber}</p>
                <p style="margin: 6px 0; font-size: 13px;"><strong>Check-in:</strong> ${checkIn} (after 2:00 PM)</p>
                <p style="margin: 6px 0; font-size: 13px;"><strong>Check-out:</strong> ${checkOut} (before 12:00 PM)</p>
                <p style="margin: 6px 0; font-size: 13px;"><strong>Duration:</strong> ${nights || ''}</p>
              </div>
              <p>Your request has been logged as a tentative hold with our estate management team. We will contact you shortly to confirm your reservation.</p>
              <p style="margin-top: 32px; color: #D4AF37;">Warmest Regards,<br/><strong>Estate Management Team</strong><br/>Alam Bali Villa</p>
            </div>
          `
        }).catch(err => console.error('Guest Receipt Email Error:', err));
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        eventId: calendarEvent.data.id,
        eventUrl: calendarEvent.data.htmlLink,
        message: 'Booking request successfully recorded on Google Calendar.'
      })
    };

  } catch (error) {
    console.error('Process Booking Serverless Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'An error occurred while creating your booking request.'
      })
    };
  }
};
