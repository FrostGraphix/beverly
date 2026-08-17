/**
 * Vercel serverless entrypoint for the real Beverly wallet backend.
 *
 * The static apps call same-origin `/api/v1/*`. vercel.json routes the wallet
 * namespaces (customer/vendor/admin/public/webhook) here, ahead of the demo
 * reference facade, so production auth and wallet operations run against the
 * real Fastify app + Supabase — not the mock facade.
 *
 * Dispatch uses Fastify's official `app.inject()` (no socket emulation, no
 * double body-parsing), which is reliable in a serverless request/response
 * model. The app is built once per warm instance and reused.
 *
 * Required Vercel env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_JWT_SECRET, CORS_ORIGINS (the app origins). Optional: PAYSTACK_*,
 * TWILIO_*, POSTMARK_* etc. for the features that use them.
 */
import { build } from '../backend/wallet/dist/app.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await build({ inMemoryRateLimit: true });
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    // Vercel Node functions expose the unparsed request stream for raw
    // functions (this file never touches request.body), so we can read it
    // directly and hand it to Fastify as the inject payload.
    if (request.body !== undefined && request.body !== null) {
      // Some runtimes pre-buffer the body; normalize to a string/Buffer.
      if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
        resolve(request.body);
      } else {
        try { resolve(JSON.stringify(request.body)); } catch { resolve(undefined); }
      }
      return;
    }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    request.on('error', reject);
  });
}

export default async function handler(request, response) {
  try {
    const app = await getApp();

    const method = (request.method || 'GET').toUpperCase();
    // Preserve the original path. vercel.json rewrites carry it via
    // ?__pathname=; fall back to request.url when routed directly.
    const rawUrl = request.url || '/';
    const urlObj = new URL(rawUrl, 'http://internal');
    const forwardedPath = urlObj.searchParams.get('__pathname');
    let targetUrl;
    if (forwardedPath) {
      urlObj.searchParams.delete('__pathname');
      const qs = urlObj.searchParams.toString();
      targetUrl = forwardedPath + (qs ? `?${qs}` : '');
    } else {
      targetUrl = rawUrl;
    }

    const payload = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(request);

    const res = await app.inject({
      method,
      url: targetUrl,
      headers: request.headers,
      payload,
    });

    for (const [key, value] of Object.entries(res.headers)) {
      if (key.toLowerCase() === 'transfer-encoding') continue;
      response.setHeader(key, value);
    }
    response.statusCode = res.statusCode;
    response.end(res.rawPayload);
  } catch (error) {
    console.error('[wallet-serverless]', error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
    }
    response.end(JSON.stringify({
      error: 'internal_error',
      message: 'The wallet backend failed to handle this request.',
    }));
  }
}
