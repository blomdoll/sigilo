const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuc2lnaWxvLnNwYWNlJA';

const SUPABASE_URL      = 'https://trkfwxxxeethqnqedxfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRya2Z3eHh4ZWV0aHFucWVkeGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTA0MTQsImV4cCI6MjA5NDUyNjQxNH0._gxl70CEc3MNVEZVOAX5jQDrvJAuFINHYhPa7Gtbstw';

// Helpers de error
function clerkErrorMsg(e) {
  if (e?.errors?.length) return e.errors[0].longMessage || e.errors[0].message;
  return e?.message || 'Error desconocido';
}

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

function clerkUserToSupabase(user) {
  if (!user) return null;
  const displayName =
    user.firstName ||
    user.unsafeMetadata?.display_name ||
    user.username ||
    user.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    'usuario';

  return {
    id:    user.externalId || user.id,
    email: user.emailAddresses?.[0]?.emailAddress || '',
    user_metadata: {
      display_name: displayName,
      avatar_url:   user.imageUrl || user.unsafeMetadata?.avatar_url || null,
      bio:          user.unsafeMetadata?.bio || '',
      username:     user.username || displayName,
    },
    _clerk_id:    user.id,
    _external_id: user.externalId || null,
  };
}

function makeAuthAdapter(clerk) {
  return {

    // Verificar sesión activa al cargar la página
    async getSession() {
      try {
        await clerk.load();
        const session = clerk.session;
        if (!session || !clerk.user) return { data: { session: null }, error: null };
        return {
          data: {
            session: {
              user: clerkUserToSupabase(clerk.user),
              access_token: await session.getToken(),
            }
          },
          error: null,
        };
      } catch (e) {
        return { data: { session: null }, error: { message: clerkErrorMsg(e) } };
      }
    },

    // Login con email + contraseña
    async signInWithPassword({ email, password }) {
      try {
        const result = await clerk.client.signIn.create({
          strategy: 'password',
          identifier: email,
          password,
        });

        if (result.status === 'complete') {
          await clerk.setActive({ session: result.createdSessionId });

          let user = clerk.user;
          for (let i = 0; i < 10 && !user; i++) {
            await new Promise(r => setTimeout(r, 200));
            user = clerk.user;
          }

          if (!user) return { data: null, error: { message: 'Sesión iniciada pero no cargó el usuario. Recargá la página.' } };
          return { data: { user: clerkUserToSupabase(user) }, error: null };
        }

        if (result.status === 'needs_second_factor') {
          return { data: null, error: { message: 'Esta cuenta requiere verificación en dos pasos.' } };
        }

        return { data: null, error: { message: 'Correo o contraseña incorrectos.' } };
      } catch (e) {
        const msg = clerkErrorMsg(e);
        if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('identifier')) {
          return { data: null, error: { message: 'Correo o contraseña incorrectos.' } };
        }
        if (msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('rate')) {
          return { data: null, error: { message: 'Demasiados intentos. Esperá unos minutos.' } };
        }
        return { data: null, error: { message: msg } };
      }
    },

    // Registro con email, contraseña y username
    async signUp({ email, password, options }) {
      try {
        const username = options?.data?.display_name || email.split('@')[0];

        const signUp = await clerk.client.signUp.create({
          emailAddress: email,
          password,
          username,
        });

        if (signUp.status === 'complete') {
          await clerk.setActive({ session: signUp.createdSessionId });
          let user = clerk.user;
          for (let i = 0; i < 8 && !user; i++) {
            await new Promise(r => setTimeout(r, 200));
            user = clerk.user;
          }
          return { data: { user: user ? clerkUserToSupabase(user) : null }, error: null };
        }
        
        if (signUp.status === 'missing_requirements') {
          try {
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          } catch (e2) { /* ya estaba preparado */ }
          window._pendingSignUp = signUp;
          // Retornar un indicador especial para que script.js muestre el mensaje correcto
          return { data: { user: null, needsVerification: true }, error: null };
        }

        return { data: null, error: { message: 'No se pudo crear la cuenta. Intentá de nuevo.' } };
      } catch (e) {
        const msg = clerkErrorMsg(e);
        if (msg.toLowerCase().includes('email') && (msg.toLowerCase().includes('taken') || msg.toLowerCase().includes('exist'))) {
          return { data: null, error: { message: 'Ese correo ya tiene una cuenta.' } };
        }
        if (msg.toLowerCase().includes('username') && (msg.toLowerCase().includes('taken') || msg.toLowerCase().includes('exist'))) {
          return { data: null, error: { message: 'Ese nombre de usuario ya está en uso.' } };
        }
        if (msg.toLowerCase().includes('password')) {
          return { data: null, error: { message: 'La contraseña no cumple los requisitos mínimos (mín. 8 caracteres).' } };
        }
        return { data: null, error: { message: msg } };
      }
    },

    // Cerrar sesión
    async signOut() {
      try { await clerk.signOut(); } catch (e) {}
      return { error: null };
    },

    // Actualizar display_name y bio del usuario
    async updateUser(attrs) {
      try {
        if (!clerk.user) return { data: null, error: { message: 'No autenticado' } };
        const updates = {};
        if (attrs.data?.display_name) updates.firstName = attrs.data.display_name;
        // bio y avatar_url van a unsafeMetadata
        const metaUpdates = {};
        if (attrs.data?.display_name !== undefined) metaUpdates.display_name = attrs.data.display_name;
        if (attrs.data?.bio          !== undefined) metaUpdates.bio          = attrs.data.bio;
        if (attrs.data?.avatar_url   !== undefined) metaUpdates.avatar_url   = attrs.data.avatar_url;

        if (Object.keys(metaUpdates).length > 0) {
          updates.unsafeMetadata = {
            ...clerk.user.unsafeMetadata,
            ...metaUpdates,
          };
        }
        await clerk.user.update(updates);
        // Recargar el usuario para reflejar los cambios
        await clerk.user.reload().catch(() => {});
        return { data: { user: clerkUserToSupabase(clerk.user) }, error: null };
      } catch (e) {
        return { data: null, error: { message: clerkErrorMsg(e) } };
      }
    },

    onAuthStateChange() {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  };
}

function buildQueryClient(clerk) {

  async function getToken() {
    try {
      return (await clerk.session?.getToken()) || null;
    } catch (e) { return null; }
  }

  // fetch personalizado que inyecta los headers requeridos por Supabase REST
  async function authFetch(url, opts = {}) {
    const token = await getToken();
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(opts.headers || {}),
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
  }

  let _pgClient = null;
  async function getPgClient() {
    if (_pgClient) return _pgClient;
    try {
      // v2 tiene ilike, cs, filter y todos los métodos que usa script.js
      const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@2');
      _pgClient = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, { fetch: authFetch });
    } catch(e) {
      throw new Error('[Sigilo] No se pudo cargar postgrest-js: ' + e.message);
    }
    return _pgClient;
  }

  return async function from(tableName) {
    const client = await getPgClient();
    return client.from(tableName);
  };
}

function makeDbProxy(clerk) {
  const fromFn = buildQueryClient(clerk);
  const auth   = makeAuthAdapter(clerk);

  return {
    auth,
    from(tableName) {
      // Retorna una Promise que resuelve al builder de postgrest-js v2.
      // El builder ya es thenable y tiene todos los métodos encadenables nativamente.
      // Usamos un Proxy para que cualquier método llamado antes de que resuelva
      // se encadene correctamente sobre la Promise.
      const builderPromise = fromFn(tableName);

      function makeChain(promise) {
        return new Proxy(promise, {
          get(target, prop) {
            // Permitir .then y .catch para que sea awaitable
            if (prop === 'then') return target.then.bind(target);
            if (prop === 'catch') return target.catch.bind(target);
            if (prop === 'finally') return target.finally.bind(target);
            // Cualquier otro método: encadenar sobre el builder resuelto
            return (...args) => makeChain(
              target.then(b => {
                if (typeof b[prop] !== 'function') {
                  throw new Error(`[db proxy] método '${String(prop)}' no existe en el builder`);
                }
                const result = b[prop](...args);
                // Si el resultado es thenable (otro builder), devolverlo directo
                // para que el siguiente encadenamiento funcione
                return result;
              })
            );
          }
        });
      }

      return makeChain(builderPromise);
    }
  };
}

// Bootstrap
(async () => {
  try {

    const { Clerk } = await import('https://esm.sh/@clerk/clerk-js@latest');
    const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
    await clerk.load();
    window._clerk = clerk;

    window.db = makeDbProxy(clerk);

    document.dispatchEvent(new Event('neon-ready'));

    console.log('[Sigilo] Clerk + Supabase listos ✅');

  } catch (err) {
    console.error('[Sigilo] Error al inicializar:', err);
    showFatalError(
      'Error al conectar con el sistema de autenticación.',
      err.message
    );
  }
})();
