const { google } = require('googleapis');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly']
});

const calendar = google.calendar({ version: 'v3', auth });

const CALENDAR_MAP = {
  1: process.env.CALENDAR_ID_VILLA1,
  2: process.env.CALENDAR_ID_VILLA2,
  3: process.env.CALENDAR_ID_VILLA3
};

exports.handler = async (event) => {
  // CORS & Caching headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, s-maxage=600' // Cache responses for 5-10 mins
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const today = new Date();
    // Query starting from 1st day of current month
    const timeMin = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)).toISOString();
    // Query up to 2 years into the future
    const timeMax = new Date(Date.UTC(today.getFullYear() + 2, 11, 31)).toISOString();

    const bookedDatesByRoom = { 1: [], 2: [], 3: [] };

    for (const [roomNum, calendarId] of Object.entries(CALENDAR_MAP)) {
      if (!calendarId) {
        console.warn(`Warning: Calendar ID for Villa ${roomNum} is missing or undefined.`);
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
        // Skip cancelled events if any
        if (ev.status === 'cancelled') return;

        const startStr = ev.start?.date || ev.start?.dateTime;
        const endStr = ev.end?.date || ev.end?.dateTime;

        if (startStr && endStr) {
          const startDatePart = startStr.split('T')[0];
          const endDatePart = endStr.split('T')[0];

          const [sy, sm, sd] = startDatePart.split('-').map(Number);
          const [ey, em, ed] = endDatePart.split('-').map(Number);

          // Use UTC dates to prevent timezone boundary skew
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
    console.error('Fetch Availability Serverless Error:', error);
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