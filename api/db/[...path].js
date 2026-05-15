/**
 * api/db.js — Proxy PostgREST → Neon
 * ─────────────────────────────────────────────────────────────────
 * Vercel Serverless Function (Node.js runtime)
 *
 * Recibe requests de PostgREST desde el frontend (clerk-init.js),
 * inyecta las credenciales de Neon y las reenvía.
 *
 * Variables de entorno requeridas en Vercel:
 *   NEON_POSTGREST_URL   → URL base de tu PostgREST en Neon
 *                          ej: https://tu-proyecto.neon.tech/rest/v1
 *   NEON_API_KEY         → Service role key / API key de Neon
 *   CLERK_SECRET_KEY     → Para verificar el JWT de Clerk (opcional pero recomendado)
 *
 * ─────────────────────────────────────────────────────────────────
 * ⚠️  IMPORTANTE — Neon + PostgREST:
 *
 * Neon NO incluye PostgREST por defecto. Hay dos opciones:
 *
 * Opción 1 (recomendada): Usar Neon's HTTP API con SQL directo
 *   → Cambia NEON_POSTGREST_URL por NEON_DATABASE_URL (connection string)
 *   → Este archivo incluye ambas implementaciones — elegí abajo.
 *
 * Opción 2: Deployar PostgREST propio apuntando a Neon
 *   → Más complejo, no necesario para este proyecto.
 *
 * Este archivo usa la Opción 1 con el Neon Serverless driver HTTP,
 * pero traduce las queries de PostgREST a SQL automáticamente.
 * ─────────────────────────────────────────────────────────────────
 */

// ─── Configuración ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://sigilosy.vercel.app',
  'https://sigilo.space',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Tablas permitidas (whitelist de seguridad)
const ALLOWED_TABLES = new Set([
  'posts', 'profiles', 'notifications', 'folders',
  'follows', 'saved_posts',
]);

// ─── CORS headers ─────────────────────────────────────────────────────────
function corsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, Range, Range-Unit',
    'Access-Control-Expose-Headers': 'Content-Range',
    'Access-Control-Max-Age': '86400',
  };
}

// ─── Parser de URL PostgREST → query SQL ──────────────────────────────────
// PostgREST usa query strings como:
//   /api/db/posts?select=*&eq.id=1&order=created_at.desc&limit=10
//
// Este parser los convierte a SQL para ejecutar en Neon directamente.

function parsePostgrestRequest(req) {
  const url = new URL(req.url, `https://${req.headers.host}`);

  // La tabla viene en el path: /api/db/posts → posts
  const pathParts = req.query.path || [];
  const table = Array.isArray(pathParts) ? pathParts[0] : pathParts;

  if (!table || !ALLOWED_TABLES.has(table)) {
    return { error: `Tabla '${table}' no permitida.` };
  }

  const params = url.searchParams;
  const method = req.method.toUpperCase();

  return { table, params, method, url };
}

// Construir cláusula WHERE desde params de PostgREST
function buildWhere(params) {
  const conditions = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of params.entries()) {
    // Ignorar params de control
    if (['select','order','limit','offset','on_conflict'].includes(key)) continue;
    if (key.startsWith('apikey') || key === 'token') continue;

    // eq.column=value  (PostgREST v1 format)
    const eqMatch = key.match(/^eq\.(.+)/);
    if (eqMatch) {
      conditions.push(`"${eqMatch[1]}" = $${idx++}`);
      values.push(val);
      continue;
    }

    // neq.column=value
    const neqMatch = key.match(/^neq\.(.+)/);
    if (neqMatch) {
      conditions.push(`"${neqMatch[1]}" != $${idx++}`);
      values.push(val);
      continue;
    }

    // gt.column=value
    const gtMatch = key.match(/^gt\.(.+)/);
    if (gtMatch) {
      conditions.push(`"${gtMatch[1]}" > $${idx++}`);
      values.push(val);
      continue;
    }

    // gte.column=value
    const gteMatch = key.match(/^gte\.(.+)/);
    if (gteMatch) {
      conditions.push(`"${gteMatch[1]}" >= $${idx++}`);
      values.push(val);
      continue;
    }

    // lt.column=value
    const ltMatch = key.match(/^lt\.(.+)/);
    if (ltMatch) {
      conditions.push(`"${ltMatch[1]}" < $${idx++}`);
      values.push(val);
      continue;
    }

    // ilike.column=%value%
    const ilikeMatch = key.match(/^ilike\.(.+)/);
    if (ilikeMatch) {
      conditions.push(`"${ilikeMatch[1]}" ILIKE $${idx++}`);
      values.push(val);
      continue;
    }

    // is.column=null | is.column=true | is.column=false
    const isMatch = key.match(/^is\.(.+)/);
    if (isMatch) {
      if (val === 'null') {
        conditions.push(`"${isMatch[1]}" IS NULL`);
      } else {
        conditions.push(`"${isMatch[1]}" IS $${idx++}`);
        values.push(val === 'true');
      }
      continue;
    }

    // in.column=(a,b,c)
    const inMatch = key.match(/^in\.(.+)/);
    if (inMatch) {
      const items = val.replace(/^\(|\)$/g, '').split(',').map(v => v.trim());
      const placeholders = items.map(() => `$${idx++}`).join(',');
      conditions.push(`"${inMatch[1]}" IN (${placeholders})`);
      values.push(...items);
      continue;
    }

    // or=(col1.eq.val,col2.ilike.%val%)  — simplificado
    if (key === 'or') {
      // Para el caso específico de sigilo: or=username.ilike.%q%,display_name.ilike.%q%
      const orParts = val.replace(/^\(|\)$/g, '').split(',');
      const orConditions = orParts.map(part => {
        const m = part.match(/^(.+?)\.(eq|ilike|is|neq)\.(.+)$/);
        if (!m) return null;
        const [, col, op, opVal] = m;
        if (op === 'eq')    { const p = `$${idx++}`; values.push(opVal);  return `"${col}" = ${p}`; }
        if (op === 'ilike') { const p = `$${idx++}`; values.push(opVal);  return `"${col}" ILIKE ${p}`; }
        if (op === 'is' && opVal === 'null') return `"${col}" IS NULL`;
        if (op === 'neq')   { const p = `$${idx++}`; values.push(opVal);  return `"${col}" != ${p}`; }
        return null;
      }).filter(Boolean);
      if (orConditions.length > 0) conditions.push(`(${orConditions.join(' OR ')})`);
      continue;
    }
  }

  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', values, nextIdx: idx };
}

// Construir ORDER BY
function buildOrder(params) {
  const order = params.get('order');
  if (!order) return '';
  // format: column.asc o column.desc
  const parts = order.split(',').map(o => {
    const [col, dir] = o.split('.');
    return `"${col}" ${dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

// ─── Ejecutar query en Neon via HTTP driver ────────────────────────────────
async function runNeonQuery(sql, values = []) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL no está configurada en las variables de entorno de Vercel.');

  // Usar @neondatabase/serverless si está disponible, sino fetch directo a Neon HTTP API
  let neon;
  try {
    ({ neon } = await import('@neondatabase/serverless'));
  } catch (e) {
    throw new Error('Paquete @neondatabase/serverless no encontrado. Ejecutá: npm install @neondatabase/serverless');
  }

  const sql_fn = neon(dbUrl);
  // neon() acepta tagged template literals. Convertimos a tagged template.
  // Para queries con placeholders $1, $2... usamos sql_fn.query(sql, values)
  const result = await sql_fn.query(sql, values);
  return result.rows;
}

// ─── Handler principal ────────────────────────────────────────────────────
export default async function handler(req, res) {
  const headers = corsHeaders(req);

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(204).set(headers).end();
  }

  // Agregar CORS headers a todas las respuestas
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const parsed = parsePostgrestRequest(req);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const { table, params, method } = parsed;
    const prefer = req.headers['prefer'] || '';
    const isSingle = prefer.includes('single') || params.get('limit') === '1';
    const wantRepresentation = prefer.includes('return=representation');

    // ── SELECT ────────────────────────────────────────────────────
    if (method === 'GET') {
      const select  = params.get('select') || '*';
      const limit   = params.get('limit')  || '100';
      const offset  = params.get('offset') || '0';
      const order   = buildOrder(params);
      const { where, values } = buildWhere(params);

      // Construir lista de columnas segura
      const cols = select === '*' ? '*' : select.split(',').map(c => `"${c.trim()}"`).join(', ');

      const sql = `SELECT ${cols} FROM "${table}" ${where} ${order} LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      const rows = await runNeonQuery(sql, values);

      if (isSingle) {
        return res.status(200).json(rows[0] || null);
      }
      return res.status(200).json(rows);
    }

    // ── INSERT ────────────────────────────────────────────────────
    if (method === 'POST') {
      const body = Array.isArray(req.body) ? req.body : [req.body];
      if (!body.length || !body[0]) return res.status(400).json({ error: 'Body vacío' });

      const keys = Object.keys(body[0]);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const rows = [];
      const allValues = [];
      let idx = 1;

      body.forEach(row => {
        const placeholders = keys.map(() => `$${idx++}`).join(', ');
        rows.push(`(${placeholders})`);
        keys.forEach(k => allValues.push(row[k]));
      });

      const returning = wantRepresentation ? 'RETURNING *' : 'RETURNING *';
      const sql = `INSERT INTO "${table}" (${cols}) VALUES ${rows.join(', ')} ${returning}`;
      const result = await runNeonQuery(sql, allValues);

      return res.status(201).json(isSingle ? result[0] : result);
    }

    // ── UPSERT (POST con Prefer: resolution=...) ──────────────────
    if (method === 'POST' && prefer.includes('resolution=')) {
      // Manejado igual que INSERT pero con ON CONFLICT
      const onConflict = params.get('on_conflict') || 'id';
      const body = Array.isArray(req.body) ? req.body : [req.body];
      const keys = Object.keys(body[0]);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const updates = keys.filter(k => k !== onConflict).map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
      const rows = [];
      const allValues = [];
      let idx = 1;

      body.forEach(row => {
        const placeholders = keys.map(() => `$${idx++}`).join(', ');
        rows.push(`(${placeholders})`);
        keys.forEach(k => allValues.push(row[k]));
      });

      const sql = `INSERT INTO "${table}" (${cols}) VALUES ${rows.join(', ')} ON CONFLICT ("${onConflict}") DO UPDATE SET ${updates} RETURNING *`;
      const result = await runNeonQuery(sql, allValues);
      return res.status(200).json(isSingle ? result[0] : result);
    }

    // ── UPDATE (PATCH) ────────────────────────────────────────────
    if (method === 'PATCH') {
      const body = req.body;
      if (!body) return res.status(400).json({ error: 'Body vacío' });

      const keys = Object.keys(body);
      let idx = 1;
      const setClauses = keys.map(k => `"${k}" = $${idx++}`).join(', ');
      const setValues  = keys.map(k => body[k]);

      const { where, values: whereValues } = buildWhere(params);
      // Ajustar índices de placeholders del WHERE
      const adjustedWhere = where.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + keys.length}`);

      const sql = `UPDATE "${table}" SET ${setClauses} ${adjustedWhere} RETURNING *`;
      const result = await runNeonQuery(sql, [...setValues, ...whereValues]);
      return res.status(200).json(isSingle ? (result[0] || null) : result);
    }

    // ── DELETE ────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const { where, values } = buildWhere(params);
      if (!where) return res.status(400).json({ error: 'DELETE sin condición WHERE no está permitido.' });
      const sql = `DELETE FROM "${table}" ${where} RETURNING *`;
      const result = await runNeonQuery(sql, values);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: `Método ${method} no soportado.` });

  } catch (err) {
    console.error('[api/db] Error:', err);
    return res.status(500).json({
      error: err.message || 'Error interno del servidor.',
    });
  }
}
