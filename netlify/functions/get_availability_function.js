const { google } = require('googleapis');

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, s-maxage=600'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const today = new Date();
    const timeMin = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)).toISOString();
    const timeMax = new Date(Date.UTC(today.getFullYear() + 2, 11, 31)).toISOString();

    const bookedDatesByRoom = { 1: [], 2: [], 3: [] };

    for (const [roomNum, calendarId] of Object.entries(CALENDAR_MAP)) {
      if (!calendarId) {
        console.warn(`Warning: Calendar ID for Villa ${roomNum} is missing.`);
        continue;
      }

      const response = await calendar.events.list({
        calendarId: calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];

      events.forEach(ev => {
        if (ev.status === 'cancelled') return;

        const startStr = ev.start?.date || ev.start?.dateTime;
        const endStr = ev.end?.date || ev.end?.dateTime;

        if (startStr && endStr) {
          const startDatePart = startStr.split('T')[0];
          const endDatePart = endStr.split('T')[0];

          const [sy, sm, sd] = startDatePart.split('-').map(Number);
          const [ey, em, ed] = endDatePart.split('-').map(Number);

          let curr = new Date(Date.UTC(sy, sm - 1, sd));
          const end = new Date(Date.UTC(ey, em - 1, ed));

          while (curr < end) {
            const yyyy = curr.getUTCFullYear();
            const mm = String(curr.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(curr.getUTCDate()).padStart(2, '0');
            const dateISO = `${yyyy}-${mm}-${dd}`;

            if (!bookedDatesByRoom[roomNum].includes(dateISO)) {
              bookedDatesByRoom[roomNum].push(dateISO);
            }
            curr.setUTCDate(curr.getUTCDate() + 1);
          }
        }
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        bookedDates: bookedDatesByRoom,
        fetchedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Fetch Availability Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error fetching calendar availability.'
      })
    };
  }
};
