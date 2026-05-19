// Cloudflare Pages Function: POST /api/submit
// Адаптация из Vercel API handler

const CORS_ORIGINS = [
  'https://claude-landing-api.pages.dev',
  'https://claude.aimastodont.com',
  'https://win.aimastodont.com',
  'http://localhost',
  'http://127.0.0.1',
];

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (CORS_ORIGINS.some((o) => origin.startsWith(o))) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(request.headers.get('origin') || ''),
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const TURNSTILE_SECRET = env.TURNSTILE_SECRET;

  const clientIp = (request.headers.get('cf-connecting-ip') || '').trim() || null;
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 500) || null;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
  }
  const { email, bonuses, turnstileToken } = body || {};

  async function logError(reason, status, extra) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/submit_errors`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          email:
            (typeof email === 'string'
              ? email.toLowerCase().trim().slice(0, 320)
              : null) || null,
          reason,
          status,
          ip: clientIp,
          user_agent: userAgent,
          ...(extra || {}),
        }),
      });
    } catch (_) {}
  }

  if (!turnstileToken) {
    await logError('captcha_missing', 403);
    return jsonResponse({ error: 'Captcha required' }, 403, cors);
  }

  try {
    const turnstileRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${TURNSTILE_SECRET}&response=${turnstileToken}`,
      }
    );
    const turnstileData = await turnstileRes.json();
    if (!turnstileData.success) {
      const codes = Array.isArray(turnstileData['error-codes'])
        ? turnstileData['error-codes'].join(',')
        : '';
      await logError('captcha_failed', 403, {
        reason: 'captcha_failed:' + codes,
      });
      return jsonResponse({ error: 'Captcha failed' }, 403, cors);
    }
  } catch (err) {
    await logError('captcha_verify_error', 500);
    return jsonResponse({ error: 'Captcha verification error' }, 500, cors);
  }

  if (
    !email ||
    typeof email !== 'string' ||
    !email.includes('@') ||
    !email.includes('.') ||
    email.length > 320
  ) {
    await logError('invalid_email', 400);
    return jsonResponse({ error: 'Invalid email' }, 400, cors);
  }

  const validBonuses = ['playlist', 'share'];
  const safeBonuses = Array.isArray(bonuses)
    ? bonuses.filter((b) => validBonuses.includes(b))
    : [];

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/giveaway_may21`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        bonuses: safeBonuses,
      }),
    });

    if (response.status === 201) {
      return jsonResponse({ ok: true }, 201, cors);
    } else if (response.status === 409) {
      return jsonResponse({ error: 'Email already registered' }, 409, cors);
    } else {
      const text = await response.text();
      await logError('supabase_error', response.status, {
        reason: 'supabase_error:' + String(text || '').slice(0, 180),
      });
      return jsonResponse({ error: 'Server error' }, 500, cors);
    }
  } catch (err) {
    await logError('supabase_fetch_error', 500, {
      reason:
        'supabase_fetch_error:' +
        String((err && err.message) || err).slice(0, 180),
    });
    return jsonResponse({ error: 'Server error' }, 500, cors);
  }
}
