/**
 * clerk-init.js
 * ─────────────────────────────────────────────────────────────────
 * Auth: Clerk JS SDK
 * Datos: PostgREST via proxy /api/db (Neon en el servidor)
 *
 * Expone window.db con la misma interfaz que usaba Supabase en script.js:
 *   - db.auth.getSession / signInWithPassword / signUp / signOut / updateUser
 *   - db.from('tabla').select / insert / upsert / update / delete + filtros
 *
 * Al terminar dispara el evento 'neon-ready' para que script.js arranque.
 * ─────────────────────────────────────────────────────────────────
 */

const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuc2lnaWxvLnNwYWNlJA';
const DB_PROXY_URL = '/api/db';

// ─── Helpers de error ──────────────────────────────────────────────────────
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

// ─── Convertir usuario Clerk → formato que espera script.js ───────────────
// ⚠️  CLAVE: usa externalId (= UUID original de Neon/Supabase) como .id
//     para que todos los datos existentes (posts, follows, likes) funcionen.
//     Para usuarios nuevos que no tienen externalId, usa clerk.user.id como fallback.
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

// ─── Adaptador Auth: traduce API Supabase → Clerk ─────────────────────────
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
        const signIn = await clerk.client.signIn.create({
          identifier: email,
          password,
        });

        if (signIn.status === 'complete') {
          await clerk.setActive({ session: signIn.createdSessionId });

          // Esperar a que clerk.user esté disponible después de setActive
          let user = clerk.user;
          for (let i = 0; i < 8 && !user; i++) {
            await new Promise(r => setTimeout(r, 200));
            user = clerk.user;
          }

          if (!user) return { data: null, error: { message: 'Sesión iniciada pero no se pudo cargar el usuario. Recargá la página.' } };
          return { data: { user: clerkUserToSupabase(user) }, error: null };
        }

        // Necesita segundo factor u otro paso — raramente ocurre
        if (signIn.status === 'needs_second_factor') {
          return { data: null, error: { message: 'Tu cuenta requiere verificación en dos pasos. Configuralo desde Clerk.' } };
        }

        return { data: null, error: { message: 'Correo o contraseña incorrectos.' } };
      } catch (e) {
        const msg = clerkErrorMsg(e);
        // Normalizar errores comunes de Clerk al español
        if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('identifier') || msg.toLowerCase().includes('invalid')) {
          return { data: null, error: { message: 'Correo o contraseña incorrectos.' } };
        }
        if (msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('rate limit')) {
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

        // Registro completo inmediatamente (modo development sin email verification)
        if (signUp.status === 'complete') {
          await clerk.setActive({ session: signUp.createdSessionId });
          let user = clerk.user;
          for (let i = 0; i < 8 && !user; i++) {
            await new Promise(r => setTimeout(r, 200));
            user = clerk.user;
          }
          return { data: { user: user ? clerkUserToSupabase(user) : null }, error: null };
        }

        // Necesita verificar email (producción) → guardar signUp pendiente y devolver user null
        // script.js interpreta user null como "revisa tu correo" y llama stab('login')
        if (signUp.status === 'missing_requirements') {
          try {
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          } catch (e2) { /* ya estaba preparado */ }
          window._pendingSignUp = signUp;
          return { data: { user: null }, error: null };
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
        return { data: { user: clerkUserToSupabase(clerk.user) }, error: null };
      } catch (e) {
        return { data: null, error: { message: clerkErrorMsg(e) } };
      }
    },

    // No-op: Clerk no usa callbacks de cambio de estado como Supabase
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  };
}

// ─── Cliente de datos: PostgREST apuntando al proxy /api/db ───────────────
// Construye cada query con el mismo patrón de Supabase que usa script.js:
//   db.from('posts').select('*').eq('id', 1).single()
//
// El proxy /api/db en Vercel recibe la request, le agrega las credenciales
// de Neon y la reenvía — así las credenciales nunca quedan en el frontend.

function buildQueryClient(clerk) {
  // Obtener token JWT de Clerk para autorizar las requests al proxy
  async function getToken() {
    try {
      return (await clerk.session?.getToken()) || null;
    } catch (e) { return null; }
  }

  // fetch personalizado que inyecta Authorization header
  async function authFetch(url, opts = {}) {
    const token = await getToken();
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(opts.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
  }

  // Importar PostgREST client (misma interfaz que Supabase para queries)
  // Se importa dinámicamente para no bloquear si falla
  let _pgClient = null;
  async function getPgClient() {
    if (_pgClient) return _pgClient;
    const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@1');
    _pgClient = new PostgrestClient(DB_PROXY_URL, { fetch: authFetch });
    return _pgClient;
  }

  // Devuelve db.from('tabla') — igual que Supabase
  return async function from(tableName) {
    const client = await getPgClient();
    return client.from(tableName);
  };
}

// ─── Objeto db completo que se expone como window.db ──────────────────────
// Usa un Proxy para que db.from() pueda ser async pero se llame igual que
// en script.js: db.from('posts').select(...)
// El truco: db.from devuelve una Promise de query builder, que se puede
// await directamente o encadenar (porque PostgREST builder es thenable).

function makeDbProxy(clerk) {
  const fromFn = buildQueryClient(clerk);
  const auth   = makeAuthAdapter(clerk);

  return new Proxy({}, {
    get(_, prop) {
      if (prop === 'auth') return auth;
      if (prop === 'from') {
        // Devuelve función que acepta tableName y retorna el builder
        return (tableName) => {
          // Retornar objeto thenable que resuelve al builder real
          // Esto permite tanto: await db.from('x').select() 
          // como: db.from('x').select().then(...)
          let _builderPromise = fromFn(tableName);

          // Proxy que intercepta todos los métodos de PostgREST
          // y los aplica sobre la Promise del builder
          const methods = [
            'select','insert','upsert','update','delete',
            'eq','neq','gt','gte','lt','lte','like','ilike',
            'in','is','not','or','and','filter',
            'order','limit','range','single','maybeSingle',
            'returns','throwOnError',
          ];

          function makeChain(builderPromise) {
            const chain = {};
            methods.forEach(method => {
              chain[method] = (...args) => {
                const next = builderPromise.then(b => {
                  if (typeof b[method] !== 'function') {
                    throw new Error(`[db proxy] método '${method}' no existe en el builder`);
                  }
                  return b[method](...args);
                });
                return makeChain(next);
              };
            });
            // Hacer la cadena thenable para que await funcione al final
            chain.then = (res, rej) => builderPromise.then(b => b, rej).then(res, rej);
            chain.catch = (rej) => builderPromise.catch(rej);
            return chain;
          }

          return makeChain(_builderPromise);
        };
      }
      return undefined;
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────
(async () => {
  try {
    // 1. Cargar Clerk SDK
    const { Clerk } = await import('https://esm.sh/@clerk/clerk-js@latest');
    const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
    await clerk.load();
    window._clerk = clerk;

    // 2. Construir window.db con adaptador auth + cliente de datos
    window.db = makeDbProxy(clerk);

    // 3. Disparar evento para que script.js arranque
    document.dispatchEvent(new Event('neon-ready'));

    console.log('[Sigilo] Clerk + Neon listos ✅');

  } catch (err) {
    console.error('[Sigilo] Error al inicializar:', err);
    showFatalError(
      'Error al conectar con el sistema de autenticación.',
      err.message
    );
  }
})();
