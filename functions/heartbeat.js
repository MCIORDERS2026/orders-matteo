// netlify/functions/heartbeat.js
//
// Updates a client's `users.last_seen` timestamp so the admin can see who's online.
//
// WHY THIS EXISTS: the client tried patching `users.last_seen` directly from the
// browser (same pattern as other client writes in this app), but it was silently
// failing — most likely blocked by a Row Level Security policy on the `users` table
// that doesn't permit clients to UPDATE their own row (or that specific column).
// Rather than guess at / loosen RLS policies, this function does the write
// server-side using the Supabase SERVICE ROLE key, which bypasses RLS entirely.
// This guarantees the heartbeat works regardless of whatever policies exist.
//
// REQUIRED SETUP (Netlify dashboard → Site settings → Environment variables):
//   Key:   SUPABASE_SERVICE_ROLE_KEY
//   Value: <the "service_role" key from Supabase → Settings → API>
//   Mark it "Contains secret values" — this key has full admin access to the DB,
//   never expose it in client-side code.

const SUPABASE_URL = 'https://kiqkosvwgnbugzqtwrem.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Netlify environment variables' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const username = (payload.username || '').trim();
  if (!username) {
    return { statusCode: 400, body: JSON.stringify({ error: 'username is required' }) };
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?username=ilike.${encodeURIComponent(username)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ last_seen: new Date().toISOString() }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Supabase error: ' + errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
