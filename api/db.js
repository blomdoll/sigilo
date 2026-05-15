/**
 * api/db.js — Proxy serverless para Neon Data API
 *
 * Recibe requests de clerk-init.js desde el navegador y los reenvía
 * a Neon con las credenciales correctas. Resuelve el problema de CORS.
 *
 * En Vercel → Settings → Environment Variables agrega:
 *   NEON_DATA_API_URL = https://ep-raspy-pond-aqbpbpf7.c-8.us-east-1.aws.neon.tech/neondb/rest/v1
 */

export default async function handler(req, res) {
  // CORS — permitir requests desde sigilo.space y localhost
  const origin = req.headers.origin || '';
  const allowed = ['https://sigilo.space', 'http://localhost:3000', 'http://localhost:5173'];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Prefer, Range, Accept-Profile, Content-Profile');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Range-Unit, X-Total-Count');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const NEON_URL = process.env.NEON_DATA_API_URL;
  if (!NEON_URL) {
    res.status(500).json({ error: 'NEON_DATA_API_URL no configurada en variables de entorno de Vercel.' });
    return;
  }

  // Construir la URL de Neon a partir del path de la request
  // El cliente llama a /api/db/profiles?select=... 
  // → reenviar a NEON_URL/profiles?select=...
  const path = req.url.replace(/^\/api\/db\/?/, '');
  const neonUrl = `${NEON_URL}/${path}`;

  // Reenviar headers relevantes (auth JWT de Clerk, prefer, etc.)
  const forwardHeaders = {
    'Content-Type': req.headers['content-type'] || 'application/json',
    'Accept': req.headers['accept'] || 'application/json',
  };

  if (req.headers['authorization']) {
    forwardHeaders['Authorization'] = req.headers['authorization'];
  }
  if (req.headers['prefer']) {
    forwardHeaders['Prefer'] = req.headers['prefer'];
  }
  if (req.headers['range']) {
    forwardHeaders['Range'] = req.headers['range'];
  }
  if (req.headers['accept-profile']) {
    forwardHeaders['Accept-Profile'] = req.headers['accept-profile'];
  }
  if (req.headers['content-profile']) {
    forwardHeaders['Content-Profile'] = req.headers['content-profile'];
  }

  // Body para métodos que lo llevan
  let body = undefined;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    body = JSON.stringify(req.body);
  }

  try {
    const neonRes = await fetch(neonUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    // Pasar headers de respuesta relevantes al cliente
    const contentRange = neonRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const xTotal = neonRes.headers.get('x-total-count');
    if (xTotal) res.setHeader('X-Total-Count', xTotal);

    const text = await neonRes.text();
    res.status(neonRes.status);

    // Intentar devolver JSON si es posible
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    console.error('[api/db] Error conectando a Neon:', err);
    res.status(502).json({ error: 'Error conectando con la base de datos.', detail: err.message });
  }
}
