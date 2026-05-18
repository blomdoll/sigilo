const KINDE_DOMAIN      = 'https://sigilo.kinde.com';   // ej: https://sigilo.kinde.com
const KINDE_CLIENT_ID   = '868889eecb5d4b71bc630f2798cf5d0e';               // SPA app → Client ID (NO el M2M)

const SUPABASE_URL      = 'https://trkfwxxxeethqnqedxfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRya2Z3eHh4ZWV0aHFucWVkeGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTA0MTQsImV4cCI6MjA5NDUyNjQxNH0._gxl70CEc3MNVEZVOAX5jQDrvJAuFINHYhPa7Gtbstw';
 
// ──────────────────────────────────────────────────────────────
 
function showFatalError(msg, detail = '') {
  const ld = document.getElementById('loading-screen');
  if (ld) {
    ld.innerHTML = `
      <div style="font-family:sans-serif;color:#c66;text-align:center;padding:2rem;max-width:420px">
        <div style="font-size:1.8rem;margin-bottom:1rem">✦ sigilo</div>
        <p style="margin-bottom:.5rem">${msg}</p>
        ${detail ? `<pre style="font-size:.72rem;text-align:left;background:#1a1a1a;color:#faa;padding:1rem;border-radius:6px;overflow:auto;margin-top:.5rem">${detail}</pre>` : ''}
        <button onclick="location.reload()" style="margin-top:1.2rem;padding:.6rem 1.4rem;background:#c66;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem">Reintentar</button>
      </div>`;
  }
}
 
function kindeUserToSupabase(user) {
  if (!user) return null;
  const displayName =
    user.given_name ||
    user.family_name ||
    user.name ||
    user.email?.split('@')[0] ||
    'usuario';
 
  return {
    id:    user.id,
    email: user.email || '',
    user_metadata: {
      display_name: user.given_name || displayName,
      avatar_url:   user.picture || null,
      bio:          '',
      username:     user.given_name || displayName,
    },
    _kinde_id: user.id,
  };
}
 
function makeAuthAdapter(kinde) {
 
  async function getSession() {
    try {
      const isAuth = await kinde.isAuthenticated();
      if (!isAuth) return { data: { session: null }, error: null };
      const user  = await kinde.getUser();
      const token = await kinde.getToken();
      return {
        data: {
          session: {
            user: kindeUserToSupabase(user),
            access_token: token,
          }
        },
        error: null,
      };
    } catch (e) {
      return { data: { session: null }, error: { message: e.message } };
    }
  }
 
  async function signInWithPassword({ email }) {
    try {
      if (email) sessionStorage.setItem('sigilo_login_hint', email);
      await kinde.login({ login_hint: email });
      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message || 'Error al iniciar sesión.' } };
    }
  }
 
  async function signUp({ email }) {
    try {
      await kinde.register({ login_hint: email });
      return { data: { user: null }, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message || 'Error al registrarse.' } };
    }
  }
 
  async function signOut() {
    try { await kinde.logout(); } catch (e) {}
    return { error: null };
  }
 
  async function updateUser() {
    return { data: { user: null }, error: null };
  }
 
  function onAuthStateChange() {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
 
  return { getSession, signInWithPassword, signUp, signOut, updateUser, onAuthStateChange };
}
 
function makeDbProxy(kinde) {
  const auth = makeAuthAdapter(kinde);

  // Cache del PostgrestClient — se inicializa una sola vez
  let _pgClient = null;

  async function authFetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(opts.headers || {}),
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
  }

  async function getPgClient() {
    if (_pgClient) return _pgClient;
    const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@2');
    _pgClient = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, { fetch: authFetch });
    return _pgClient;
  }

  // Devuelve un proxy que acumula llamadas de métodos y las ejecuta
  // en cuanto el builder asíncrono esté disponible.
  function makeChain(builderPromise) {
    // Cola de operaciones pendientes: [{method, args}]
    const ops = [];

    const proxy = new Proxy({}, {
      get(_, prop) {
        // Cuando se hace "await" o ".then()" → ejecutar toda la cadena
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          const resultPromise = builderPromise.then(async client => {
            let b = client;
            for (const { method, args } of ops) {
              if (typeof b[method] !== 'function') {
                throw new Error(`[db proxy] método '${method}' no existe en el builder`);
              }
              b = b[method](...args);
            }
            return b;
          });
          return resultPromise[prop].bind(resultPromise);
        }
        // Acumular métodos en la cadena
        return (...args) => {
          ops.push({ method: prop, args });
          return proxy;
        };
      }
    });

    return proxy;
  }

  return {
    auth,
    from(tableName) {
      const builderPromise = getPgClient().then(client => client.from(tableName));
      return makeChain(builderPromise);
    }
  };
}
 
// ──────────────────────────────────────────────────────────────
//  Bootstrap — carga el SDK de Kinde via script tag (UMD)
// ──────────────────────────────────────────────────────────────
 
(async () => {
  try {
    // Cargar el SDK de Kinde como script UMD (más compatible con browsers)
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/kinde-auth-pkce-js.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de Kinde desde el CDN.'));
      document.head.appendChild(s);
    });
 
    // El UMD expone la función en window — probamos los nombres posibles
    const createKindeClient =
      window.createKindeClient ||
      window.KindeAuth?.createKindeClient ||
      window['kinde-auth-pkce-js']?.createKindeClient;
 
    if (typeof createKindeClient !== 'function') {
      // Fallback: intentar con el nombre del objeto exportado
      const allKeys = Object.keys(window).filter(k => k.toLowerCase().includes('kinde'));
      throw new Error(
        'createKindeClient no encontrado. Claves de Kinde en window: ' +
        (allKeys.join(', ') || 'ninguna')
      );
    }
 
    const kinde = await createKindeClient({
      client_id:    KINDE_CLIENT_ID,
      domain:       KINDE_DOMAIN,
      redirect_uri: window.location.origin,
      logout_uri:   window.location.origin,
      scope:        'openid profile email',
    });
 
    // Procesar callback de Kinde al volver del login/register
    if (window.location.search.includes('code=')) {
      await kinde.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
 
    window._kinde = kinde;
    const db = makeDbProxy(kinde);
    window.db = db;

// ── Migración automática de IDs ────────────────────────────
try {
  const isAuth = await kinde.isAuthenticated();
  if (isAuth) {
    const kindeUser = kinde.getUser();
    if (kindeUser && kindeUser.id) {
      const kindeId    = kindeUser.id;
      const kindeEmail = kindeUser.email || '';
      const kindeName  = kindeUser.given_name || kindeUser.name || '';

      const headers = {
        'Content-Type': 'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer':        'return=minimal',
      };
      const base = SUPABASE_URL + '/rest/v1';
      const get  = (filter) =>
        fetch(`${base}/profiles?${filter}&select=*`, { headers }).then(r => r.json());
      const patch = (filter, body) =>
        fetch(`${base}/profiles?${filter}`, { method: 'PATCH', headers, body: JSON.stringify(body) });

      // 1. Buscar perfil con el ID de Kinde (puede existir vacío de una migración previa fallida)
      const [perfilNuevo] = await get(`id=eq.${kindeId}`);

      // 2. Buscar perfil viejo (UUID) por email o por nombre
      let perfilViejo = null;
      if (kindeEmail) {
        const byEmail = await get(`email=eq.${encodeURIComponent(kindeEmail)}&id=not.like.kp_*`);
        if (byEmail.length === 1) perfilViejo = byEmail[0];
      }
      if (!perfilViejo && kindeName) {
        const byName = await get(`display_name=eq.${encodeURIComponent(kindeName)}&id=not.like.kp_*`);
        if (byName.length === 1) perfilViejo = byName[0];
      }

      // CASO A: tiene perfil nuevo kp_ vacío Y perfil viejo con datos → fusionar
      const nuevoEstaVacio = perfilNuevo && !perfilNuevo.avatar_url && !perfilNuevo.bio;
      if (perfilNuevo && perfilViejo && nuevoEstaVacio) {
        console.log(`[Sigilo] Fusionando perfil vacío kp_ con datos del viejo ${perfilViejo.id}`);

        // Copiar datos del viejo al nuevo
        await patch(`id=eq.${kindeId}`, {
          avatar_url:      perfilViejo.avatar_url,
          bio:             perfilViejo.bio,
          followers_count: perfilViejo.followers_count,
          following_count: perfilViejo.following_count,
          email:           kindeEmail || perfilViejo.email,
        });

        // Reasignar tablas hijas del viejo al nuevo
        const patchTable = (table, filter, body) =>
          fetch(`${base}/${table}?${filter}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        const oldId = perfilViejo.id;
        await patchTable('posts',         `user_id=eq.${oldId}`,      { user_id: kindeId });
        await patchTable('follows',       `follower_id=eq.${oldId}`,  { follower_id: kindeId });
        await patchTable('follows',       `following_id=eq.${oldId}`, { following_id: kindeId });
        await patchTable('folders',       `user_id=eq.${oldId}`,      { user_id: kindeId });
        await patchTable('notifications', `to_uid=eq.${oldId}`,       { to_uid: kindeId });
        await patchTable('notifications', `from_uid=eq.${oldId}`,     { from_uid: kindeId });

        // Borrar perfil viejo
        await fetch(`${base}/profiles?id=eq.${oldId}`, { method: 'DELETE', headers });
        console.log('[Sigilo] Fusión completada ✅');
      }

      // CASO B: no tiene perfil nuevo kp_ Y tiene perfil viejo → migración completa
      else if (!perfilNuevo && perfilViejo) {
        console.log(`[Sigilo] Migrando ID: ${perfilViejo.id} → ${kindeId}`);

        // Insertar perfil nuevo copiando todos los datos del viejo
        const perfilNuevoData = { ...perfilViejo, id: kindeId, email: kindeEmail || perfilViejo.email };
        await fetch(`${base}/profiles`, {
          method: 'POST',
          headers,
          body: JSON.stringify(perfilNuevoData),
        });

        // Reasignar tablas hijas
        const patchTable = (table, filter, body) =>
          fetch(`${base}/${table}?${filter}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        const oldId = perfilViejo.id;
        await patchTable('posts',         `user_id=eq.${oldId}`,      { user_id: kindeId });
        await patchTable('follows',       `follower_id=eq.${oldId}`,  { follower_id: kindeId });
        await patchTable('follows',       `following_id=eq.${oldId}`, { following_id: kindeId });
        await patchTable('folders',       `user_id=eq.${oldId}`,      { user_id: kindeId });
        await patchTable('notifications', `to_uid=eq.${oldId}`,       { to_uid: kindeId });
        await patchTable('notifications', `from_uid=eq.${oldId}`,     { from_uid: kindeId });

        // Borrar perfil viejo
        await fetch(`${base}/profiles?id=eq.${oldId}`, { method: 'DELETE', headers });
        console.log('[Sigilo] Migración completa ✅');
      }

      // CASO C: ya tiene perfil kp_ con datos → solo actualizar email si falta
      else if (perfilNuevo && !nuevoEstaVacio) {
        if (kindeEmail && !perfilNuevo.email) {
          await patch(`id=eq.${kindeId}`, { email: kindeEmail });
        }
      }

      // CASO D: no tiene perfil viejo ni nuevo → usuario completamente nuevo, no hacer nada
      // (el perfil se crea al registrarse con sigilo_pending_username)
    }
  }
} catch(migErr) {
  console.warn('[Sigilo] Error en migración (no crítico):', migErr.message);
}
// ───────────────────────────────────────────────────────────
