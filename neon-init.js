/**
 * neon-init.js — Inicialización del cliente Neon para Sigilo
 *
 * Carga @neondatabase/neon-js vía ESM (esm.sh) y expone window.db
 * con la misma API que usaba Supabase (SupabaseAuthAdapter).
 *
 * CONFIGURACIÓN REQUERIDA:
 *   NEON_AUTH_URL  → Neon Console → Auth → Configuration → "Auth URL"
 *   NEON_DATA_API_URL → Neon Console → Data API page → "API URL"
 *
 * Tu Auth URL ya configurada:
 *   https://ep-raspy-pond-aqbpbpf7.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth
 *
 * La Data API URL la encuentras en la Consola de Neon → Data API.
 * Tendrá un formato similar a:
 *   https://ep-raspy-pond-aqbpbpf7.c-8.us-east-1.aws.neon.tech/neondb/rest/v1
 * o en proyectos más nuevos:
 *   https://<project-id>.data-api.neon.tech
 * ⚠️  Reemplaza NEON_DATA_API_URL_HERE con tu URL real.
 */

const NEON_AUTH_URL     = 'https://ep-raspy-pond-aqbpbpf7.neonauth.c-8.us-east-1.aws.neon.tech/neondb/auth';
const NEON_DATA_API_URL = 'NEON_DATA_API_URL_HERE'; // ← REEMPLAZA ESTO

import('https://esm.sh/@neondatabase/neon-js@latest').then(({ createClient, SupabaseAuthAdapter }) => {
  const db = createClient({
    auth: {
      url: NEON_AUTH_URL,
      adapter: SupabaseAuthAdapter(),
    },
    dataApi: {
      url: NEON_DATA_API_URL,
    },
  });

  window.db = db;

  // Disparar evento para que script.js sepa que db está listo
  document.dispatchEvent(new Event('neon-ready'));
}).catch(err => {
  console.error('[Sigilo] Error cargando Neon SDK:', err);
  // Mostrar error en pantalla de carga
  const ld = document.getElementById('loading-screen');
  if (ld) {
    ld.innerHTML = `
      <div style="font-family:sans-serif;color:#c66;text-align:center;padding:2rem;max-width:400px">
        <div style="font-size:1.8rem;margin-bottom:1rem">✦ sigilo</div>
        <p>Error al conectar con la base de datos.<br>Revisa la configuración en <code>neon-init.js</code>.</p>
        <pre style="font-size:.75rem;text-align:left;background:#1a1a1a;padding:1rem;border-radius:6px;overflow:auto">${err.message}</pre>
        <button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.4rem;background:#c66;color:#fff;border:none;border-radius:6px;cursor:pointer">Reintentar</button>
      </div>`;
  }
});
