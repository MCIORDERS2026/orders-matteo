// netlify/functions/send-order-email.js
//
// Sends an admin notification email (via Resend) every time a client places a new
// order or updates an existing pending one. ZERO EXTRA DEPENDENCIES — uses the
// built-in fetch available in Netlify's Node runtime to call the Resend API directly.
//
// REQUIRED SETUP (do this in the Netlify dashboard, never commit the key to the repo):
//   Site settings → Environment variables → New variable
//     Key:   RESEND_API_KEY
//     Value: <your Resend API key, from resend.com/api-keys>
//
// Sender: uses Resend's built-in "onboarding@resend.dev" address, which requires no
// domain verification but only delivers to the email address your Resend account
// itself is registered with. Since mciweborders@gmail.com IS the Resend account
// email, this works out of the box. If that ever changes, verify a custom domain in
// Resend and update FROM_EMAIL below.

const ADMIN_NOTIFY_EMAIL = 'mciweborders@gmail.com';
const FROM_EMAIL = 'Matteo Orders <onboarding@resend.dev>';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wraps a product description in parentheses, unless it already has its own
// (e.g. "Box (24)") — avoids showing doubled parens like "Box ((24))".
function wrapDesc(d) {
  if (!d) return '';
  return /[()]/.test(d) ? d : '(' + d + ')';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY is not configured in Netlify environment variables' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    username = '',
    displayName = '',
    orderNumber = null,
    timestamp = '',
    orderedBy = '',
    items = [], // [{ name, description, qty }, ...]
    isUpdate = false,
  } = payload;

  const clientLabel = displayName || username || 'Unknown client';
  const totalQty = items.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 0), 0);

  const itemRows = items
    .map(
      (i) => `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;">${esc(i.name)}${i.description ? ` <span style="color:#888;font-size:11px;">${wrapDesc(esc(i.description))}</span>` : ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center;font-weight:700;">${esc(i.qty)}</td>
      </tr>`
    )
    .join('');

  const itemsTableHtml = items.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="background:#e8e8e8;">
            <th style="padding:7px 10px;text-align:left;font-size:11px;color:#444;text-transform:uppercase;letter-spacing:.5px;">Product</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;color:#444;text-transform:uppercase;letter-spacing:.5px;width:60px;">Qty</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#f2f2f2;">
            <td style="padding:8px 10px;font-weight:700;font-size:13px;border-top:2px solid #1D9E75;">Total</td>
            <td style="padding:8px 10px;text-align:center;font-weight:800;font-size:14px;border-top:2px solid #1D9E75;color:#1D9E75;">${totalQty}</td>
          </tr>
        </tfoot>
      </table>`
    : '<p style="font-size:13px;color:#888;margin-top:12px;">No items.</p>';

  const heading = isUpdate ? '🔄 Order Updated' : '🆕 New Order';
  const subject = `${isUpdate ? 'Order updated' : 'New order'} — ${clientLabel}${orderNumber ? ' #' + orderNumber : ''}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#1D9E75;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:18px;">${heading}</h2>
      </div>
      <div style="border:1px solid #e5e5e3;border-top:none;padding:20px;border-radius:0 0 10px 10px;">
        <table style="font-size:14px;margin-bottom:6px;">
          <tr><td style="padding:2px 8px 2px 0;color:#555;">Client:</td><td style="font-weight:700;">${esc(clientLabel)}</td></tr>
          ${orderNumber ? `<tr><td style="padding:2px 8px 2px 0;color:#555;">Order #:</td><td style="font-weight:700;">${esc(orderNumber)}</td></tr>` : ''}
          ${orderedBy ? `<tr><td style="padding:2px 8px 2px 0;color:#555;">Placed by:</td><td>${esc(orderedBy)}</td></tr>` : ''}
          <tr><td style="padding:2px 8px 2px 0;color:#555;">Date:</td><td>${esc(timestamp)}</td></tr>
        </table>
        ${itemsTableHtml}
      </div>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_NOTIFY_EMAIL],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Resend error: ' + errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
