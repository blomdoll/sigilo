const KINDE_DOMAIN    = 'https://sigilo.kinde.com';
const KINDE_CLIENT_ID = '868889eecb5d4b71bc630f2798cf5d0e';

const SUPABASE_URL      = 'https://trkfwxxxeethqnqedxfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRya2Z3eHh4ZWV0aHFucWVkeGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTA0MTQsImV4cCI6MjA5NDUyNjQxNH0._gxl70CEc3MNVEZVOAX5jQDrvJAuFINHYhPa7Gtbstw';

window._sigiloSupabaseUrl     = SUPABASE_URL;
window._sigiloSupabaseAnonKey = SUPABASE_ANON_KEY;

// ---

function mostrarErrorFatal(msg, detalle = '') {
  const ld = document.getElementById('loading-screen');
  if (ld) {
    ld.innerHTML = `
      <div style="font-family:sans-serif;color:#c66;text-align:center;padding:2rem;max-width:420px">
        <div style="font-size:1.8rem;margin-bottom:1rem">✦ sigilo</div>
        <p style="margin-bottom:.5rem">${msg}</p>
        ${detalle ? `<pre style="font-size:.72rem;text-align:left;background:#1a1a1a;color:#faa;padding:1rem;border-radius:6px;overflow:auto;margin-top:.5rem">${detalle}</pre>` : ''}
        <button onclick="location.reload()" style="margin-top:1.2rem;padding:.6rem 1.4rem;background:#c66;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem">Reintentar</button>
      </div>`;
  }
}

function kindeASupabase(user) {
  if (!user) return null;
  const nombre =
    user.given_name ||
    user.family_name ||
    user.name ||
    user.email?.split('@')[0] ||
    'usuario';

  return {
    id:    user.id,
    email: user.email || '',
    user_metadata: {
      display_name: user.given_name || nombre,
      avatar_url:   user.picture || null,
      bio:          null,
      username:     user.given_name || nombre,
    },
    _kinde_id: user.id,
  };
}

const CLAVE_USUARIO = 'sigilo_kinde_user';

function guardarUsuario(user) {
  try { if (user) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(user)); } catch(e) {}
}
function cargarUsuario() {
  try { const s = localStorage.getItem(CLAVE_USUARIO); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}
function borrarUsuario() {
  try { localStorage.removeItem(CLAVE_USUARIO); } catch(e) {}
}

function crearAuth(kinde) {

  async function getSession() {
    try {
      const autenticado = await kinde.isAuthenticated();
      if (autenticado) {
        const user = kinde.getUser();
        if (user) {
          guardarUsuario(user);
          let token = null;
          try { token = await kinde.getToken(); } catch(e) {}
          return {
            data: { session: { user: kindeASupabase(user), access_token: token } },
            error: null,
          };
        }
      }

      const usuarioGuardado = cargarUsuario();
      if (usuarioGuardado) {
        try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${usuarioGuardado.id}&select=id`,
            { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
          );
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return {
              data: { session: { user: kindeASupabase(usuarioGuardado), access_token: null } },
              error: null,
            };
          }
        } catch(e) {}
        return {
          data: { session: { user: kindeASupabase(usuarioGuardado), access_token: null } },
          error: null,
        };
      }

      return { data: { session: null }, error: null };
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
    borrarUsuario();
    return { error: null };
  }

  async function updateUser({ data: datosUsuario } = {}) {
    try {
      let user = null;
      try {
        const autenticado = await kinde.isAuthenticated();
        if (autenticado) user = kinde.getUser();
      } catch(e) {}
      if (!user) user = cargarUsuario();
      if (!user) return { data: null, error: { message: 'Sin usuario' } };

      if (datosUsuario) {
        const cambios = {};
        if (datosUsuario.display_name !== undefined) {
          cambios.display_name = datosUsuario.display_name;
          cambios.username     = datosUsuario.display_name;
        }
        if (datosUsuario.bio !== undefined) cambios.bio = datosUsuario.bio;

        if (Object.keys(cambios).length > 0) {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':  'application/json',
                'apikey':        SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer':        'return=minimal',
              },
              body: JSON.stringify(cambios),
            }
          );
          if (!res.ok) {
            const err = await res.text();
            return { data: null, error: { message: err } };
          }
        }
      }

      return { data: { user }, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  function onAuthStateChange() {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  return { getSession, signInWithPassword, signUp, signOut, updateUser, onAuthStateChange };
}

function crearDb(kinde) {
  const auth = crearAuth(kinde);
  let _cliente = null;

  async function fetchConAuth(url, opts = {}) {
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

  async function getCliente() {
    if (_cliente) return _cliente;
    const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@2');
    _cliente = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, { fetch: fetchConAuth });
    return _cliente;
  }

  function encadenar(promesaBuilder) {
    const ops = [];

    function ejecutar() {
      return promesaBuilder.then(async builder => {
        let b = builder;
        for (const { metodo, args } of ops) {
          if (typeof b[metodo] !== 'function') {
            throw new Error(`[db] '${metodo}' no es un método válido`);
          }
          b = b[metodo](...args);
        }
        return b;
      });
    }

    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          const p = ejecutar();
          return p[prop].bind(p);
        }
        return (...args) => {
          ops.push({ metodo: prop, args });
          return proxy;
        };
      }
    });

    return proxy;
  }

  return {
    auth,
    from(tabla) {
      const promesa = getCliente().then(c => c.from(tabla));
      return encadenar(promesa);
    }
  };
}

// ---

(async () => {
  try {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/kinde-auth-pkce-js.umd.min.js';
      s.onload = ok;
      s.onerror = () => fail(new Error('No se pudo cargar el SDK de Kinde.'));
      document.head.appendChild(s);
    });

    const crearKinde =
      window.createKindeClient ||
      window.KindeAuth?.createKindeClient ||
      window['kinde-auth-pkce-js']?.createKindeClient;

    if (typeof crearKinde !== 'function') {
      const claves = Object.keys(window).filter(k => k.toLowerCase().includes('kinde'));
      throw new Error(
        'createKindeClient no encontrado. Claves de Kinde en window: ' +
        (claves.join(', ') || 'ninguna')
      );
    }

    const kinde = await crearKinde({
      client_id:    KINDE_CLIENT_ID,
      domain:       KINDE_DOMAIN,
      redirect_uri: window.location.origin,
      logout_uri:   window.location.origin,
      scope:        'openid profile email',
      is_dangerously_use_local_storage: true,
    });

    if (window.location.search.includes('code=')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    window._kinde = kinde;

    try {
      const autenticado = await kinde.isAuthenticated();
      if (autenticado) {
        const user = kinde.getUser();
        if (user) guardarUsuario(user);
      }
    } catch(e) {}

    const db = crearDb(kinde);
    window.db = db;

    // Migración de IDs (máx. 5 segundos)
    await Promise.race([
      (async () => {
        try {
          const autenticado = await kinde.isAuthenticated();
          if (!autenticado) return;

          const kindeUser = await kinde.getUser();
          if (!kindeUser || !kindeUser.id) return;

          const kindeId    = kindeUser.id;
          const kindeEmail = kindeUser.email || '';
          const kindeName  = kindeUser.given_name || kindeUser.name || '';

          const cabeceras = {
            'Content-Type': 'application/json',
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer':        'return=minimal',
          };
          const base = SUPABASE_URL + '/rest/v1';

          const getPerfil = (filtro) =>
            fetch(`${base}/profiles?${filtro}&select=*`, { headers: cabeceras }).then(r => r.json());
          const patchPerfil = (filtro, body) =>
            fetch(`${base}/profiles?${filtro}`, { method: 'PATCH', headers: cabeceras, body: JSON.stringify(body) });
          const patchTabla = (tabla, filtro, body) =>
            fetch(`${base}/${tabla}?${filtro}`, { method: 'PATCH', headers: cabeceras, body: JSON.stringify(body) });

          const resNuevo   = await getPerfil(`id=eq.${kindeId}`);
          const perfilNuevo = Array.isArray(resNuevo) ? resNuevo[0] : null;

          let perfilViejo = null;
          if (kindeEmail) {
            const porEmail = await getPerfil(`email=eq.${encodeURIComponent(kindeEmail)}&id=not.like.kp_*`);
            if (Array.isArray(porEmail) && porEmail.length === 1) perfilViejo = porEmail[0];
          }
          if (!perfilViejo && kindeName) {
            const porNombre = await getPerfil(`display_name=eq.${encodeURIComponent(kindeName)}&id=not.like.kp_*`);
            if (Array.isArray(porNombre) && porNombre.length === 1) perfilViejo = porNombre[0];
          }

          const sinAvatar = perfilNuevo && !perfilNuevo.avatar_url && perfilViejo?.avatar_url;
          const sinBio    = perfilNuevo && !perfilNuevo.bio        && perfilViejo?.bio;

          if (perfilNuevo && perfilViejo) {
            const viejoId = perfilViejo.id;
            const datos = { email: kindeEmail || perfilViejo.email };
            if (sinAvatar) datos.avatar_url = perfilViejo.avatar_url;
            if (sinBio)    datos.bio        = perfilViejo.bio;
            if (!perfilNuevo.followers_count && perfilViejo.followers_count) datos.followers_count = perfilViejo.followers_count;
            if (!perfilNuevo.following_count && perfilViejo.following_count) datos.following_count = perfilViejo.following_count;

            await patchPerfil(`id=eq.${kindeId}`, datos);
            await patchTabla('posts',         `user_id=eq.${viejoId}`,      { user_id: kindeId });
            await patchTabla('follows',       `follower_id=eq.${viejoId}`,  { follower_id: kindeId });
            await patchTabla('follows',       `following_id=eq.${viejoId}`, { following_id: kindeId });
            await patchTabla('folders',       `user_id=eq.${viejoId}`,      { user_id: kindeId });
            await patchTabla('notifications', `to_uid=eq.${viejoId}`,       { to_uid: kindeId });
            await patchTabla('notifications', `from_uid=eq.${viejoId}`,     { from_uid: kindeId });
            await fetch(`${base}/profiles?id=eq.${viejoId}`, { method: 'DELETE', headers: cabeceras });

          } else if (!perfilNuevo && perfilViejo) {
            const viejoId = perfilViejo.id;
            await fetch(`${base}/profiles`, {
              method: 'POST', headers: cabeceras,
              body: JSON.stringify({ ...perfilViejo, id: kindeId, email: kindeEmail || perfilViejo.email }),
            });
            await patchTabla('posts',         `user_id=eq.${viejoId}`,      { user_id: kindeId });
            await patchTabla('follows',       `follower_id=eq.${viejoId}`,  { follower_id: kindeId });
            await patchTabla('follows',       `following_id=eq.${viejoId}`, { following_id: kindeId });
            await patchTabla('folders',       `user_id=eq.${viejoId}`,      { user_id: kindeId });
            await patchTabla('notifications', `to_uid=eq.${viejoId}`,       { to_uid: kindeId });
            await patchTabla('notifications', `from_uid=eq.${viejoId}`,     { from_uid: kindeId });
            await fetch(`${base}/profiles?id=eq.${viejoId}`, { method: 'DELETE', headers: cabeceras });

          } else if (perfilNuevo && !perfilViejo) {
            if (kindeEmail && !perfilNuevo.email) {
              await patchPerfil(`id=eq.${kindeId}`, { email: kindeEmail });
            }
          }

        } catch (err) {
          console.warn('[Sigilo] Error en migración:', err.message);
        }
      })(),
      new Promise(r => setTimeout(r, 5000)),
    ]);

    document.dispatchEvent(new Event('neon-ready'));

  } catch (err) {
    console.error('[Sigilo] Error al inicializar:', err);
    mostrarErrorFatal('Error al conectar con el sistema de autenticación.', err.message);
  }
})();
