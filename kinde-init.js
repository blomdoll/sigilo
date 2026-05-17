const KINDE_DOMAIN      = 'https://sigilo.kinde.com';   // ej: https://sigilo.kinde.com
const KINDE_CLIENT_ID   = '868889eecb5d4b71bc630f2798cf5d0e';               // SPA app → Client ID (NO el M2M)

const SUPABASE_URL      = 'https://trkfwxxxeethqnqedxfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRya2Z3eHh4ZWV0aHFucWVkeGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTA0MTQsImV4cCI6MjA5NDUyNjQxNH0._gxl70CEc3MNVEZVOAX5jQDrvJAuFINHYhPa7Gtbstw';

// ──────────────────────────────────────────────────────────────
//  Helpers
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

// ──────────────────────────────────────────────────────────────
//  Kinde PKCE SPA client
//  Usamos el SDK oficial de Kinde para SPAs (sin backend)
// ──────────────────────────────────────────────────────────────

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

  // Kinde SPA usa redirección para login/register — igual que Supabase Auth.
  // Abrimos el popup de login en la misma pestaña (redirect flow).
  async function signInWithPassword({ email }) {
    try {
      // Guardamos el email para pre-rellenarlo si el proveedor lo permite
      if (email) sessionStorage.setItem('sigilo_login_hint', email);
      await kinde.login({ login_hint: email });
      // El control pasa a Kinde; cuando regrese, getSession() tendrá la sesión.
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

  // updateUser: Kinde no permite editar el perfil desde el cliente SPA
  // directamente, así que guardamos display_name/bio en la tabla profiles
  // de Supabase (igual que hacía la app antes con unsafeMetadata).
  async function updateUser(attrs) {
    // La app guarda display_name, bio y avatar_url en la tabla `profiles`
    // de Supabase — ese flujo no cambia nada, lo sigue manejando script.js.
    return { data: { user: null }, error: null };
  }

  function onAuthStateChange() {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  return { getSession, signInWithPassword, signUp, signOut, updateUser, onAuthStateChange };
}

// ──────────────────────────────────────────────────────────────
//  Query client (Supabase REST via postgrest-js) — sin cambios
// ──────────────────────────────────────────────────────────────

function buildQueryClient(getTokenFn) {

  async function authFetch(url, opts = {}) {
    const token = await getTokenFn();
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(opts.headers || {}),
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
  }

  let _pgClient = null;
  async function getPgClient() {
    if (_pgClient) return _pgClient;
    const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@2');
    _pgClient = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, { fetch: authFetch });
    return _pgClient;
  }

  return async function from(tableName) {
    const client = await getPgClient();
    return client.from(tableName);
  };
}

function makeDbProxy(kinde) {
  const fromFn = buildQueryClient(() => kinde.getToken().catch(() => null));
  const auth   = makeAuthAdapter(kinde);

  return {
    auth,
    from(tableName) {
      const builderPromise = fromFn(tableName);

      function makeChain(promise) {
        return new Proxy(promise, {
          get(target, prop) {
            if (prop === 'then')    return target.then.bind(target);
            if (prop === 'catch')   return target.catch.bind(target);
            if (prop === 'finally') return target.finally.bind(target);
            return (...args) => makeChain(
              target.then(b => {
                if (typeof b[prop] !== 'function') {
                  throw new Error(`[db proxy] método '${String(prop)}' no existe en el builder`);
                }
                return b[prop](...args);
              })
            );
          }
        });
      }

      return makeChain(builderPromise);
    }
  };
}

// ──────────────────────────────────────────────────────────────
//  Bootstrap
// ──────────────────────────────────────────────────────────────

(async () => {
  try {
    const { createKindeClient } = await import('https://esm.sh/@kinde-oss/kinde-auth-pkce-js');

    const kinde = await createKindeClient({
      client_id:     KINDE_CLIENT_ID,
      domain:        KINDE_DOMAIN,
      redirect_uri:  window.location.origin,
      logout_uri:    window.location.origin,
      scope:         'openid profile email',
    });

    // Manejar el callback de Kinde (cuando regresa de /login o /register)
    // Kinde PKCE necesita procesar el code de la URL al volver
    if (window.location.search.includes('code=')) {
      await kinde.handleRedirectCallback();
      // Limpiar la URL sin recargar la página
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    window._kinde = kinde;
    window.db = makeDbProxy(kinde);

    document.dispatchEvent(new Event('neon-ready'));
    console.log('[Sigilo] Kinde + Supabase listos ✅');

  } catch (err) {
    console.error('[Sigilo] Error al inicializar:', err);
    showFatalError(
      'Error al conectar con el sistema de autenticación.',
      err.message
    );
  }
})();
