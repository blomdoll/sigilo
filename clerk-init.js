/**
 * clerk-init.js
 * ─────────────────────────────────────────────────────────────────
 * Inicialización de Sigilo con Clerk (auth) + Neon REST API (datos)
 *
 * Reemplaza completamente neon-init.js.
 * En index.html cambia:
 *   <script type="module" src="neon-init.js"></script>
 * por:
 *   <script type="module" src="clerk-init.js"></script>
 *
 * CONFIGURACIÓN — reemplaza los valores de abajo:
 *   CLERK_PUBLISHABLE_KEY → Clerk dashboard → Configure → API Keys
 *   NEON_DATA_API_URL     → Neon Console → Data API → API URL
 * ─────────────────────────────────────────────────────────────────
 */

const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuc2lnaWxvLnNwYWNlJA';  // ← tu clave
const NEON_DATA_API_URL     = 'https://ep-raspy-pond-aqbpbpf7.c-8.us-east-1.aws.neon.tech/neondb/rest/v1';

// ─── Cargar Clerk SDK ────────────────────────────────────────────────
import('https://esm.sh/@clerk/clerk-js@latest').then(async ({ Clerk }) => {
  const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
  await clerk.load();

  window._clerk = clerk;

  // ─── Cliente de datos Neon (misma API que Supabase) ──────────────
  // Usa @supabase/postgrest-js directamente para mantener la misma
  // interfaz de `db.from('tabla').select(...)` que usa todo script.js
  const { PostgrestClient } = await import('https://esm.sh/@supabase/postgrest-js@1');

  // Función que obtiene el token JWT de Clerk para autenticar requests a Neon
  async function getToken() {
    try {
      const token = await clerk.session?.getToken();
      return token || null;
    } catch(e) { return null; }
  }

  // Construir cliente Neon con headers dinámicos (token se refresca automáticamente)
  function makeNeonClient() {
    return new Proxy({}, {
      get(_, table) {
        if (table === 'auth') return clerkAuthAdapter(clerk);
        if (table === 'from') return (tableName) => buildQuery(tableName);
        if (table === 'storage') return storageAdapter();
        return undefined;
      }
    });
  }

  function buildQuery(tableName) {
    // Retorna un objeto que construye queries como Supabase
    const client = new PostgrestClient(NEON_DATA_API_URL, {
      fetch: async (url, opts = {}) => {
        const token = await getToken();
        return fetch(url, {
          ...opts,
          headers: {
            ...opts.headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          }
        });
      }
    });
    return client.from(tableName);
  }

  // ─── Adaptador de Auth — traduce API Supabase → Clerk ────────────
  function clerkAuthAdapter(clerk) {
    return {
      // getSession() → devuelve { data: { session } }
      async getSession() {
        const session = clerk.session;
        if (!session) return { data: { session: null }, error: null };
        const user = clerk.user;
        return {
          data: {
            session: {
              user: _clerkUserToSupabase(user),
              access_token: await session.getToken(),
            }
          },
          error: null
        };
      },

      // signInWithPassword({ email, password })
      async signInWithPassword({ email, password }) {
        try {
          // Clerk ClerkJS signIn flow
          const signIn = await clerk.client.signIn.create({
            identifier: email,
            password,
          });
          if (signIn.status === 'complete') {
            await clerk.setActive({ session: signIn.createdSessionId });
            const user = clerk.user;
            return { data: { user: _clerkUserToSupabase(user) }, error: null };
          }
          return { data: null, error: { message: 'Error al iniciar sesión' } };
        } catch(e) {
          return { data: null, error: { message: _clerkError(e) } };
        }
      },

      // signUp({ email, password, options: { data: { display_name } } })
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
            return { data: { user: _clerkUserToSupabase(clerk.user) }, error: null };
          }

          // Si necesita verificar email
          if (signUp.status === 'missing_requirements') {
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
            // Guardar el signUp pendiente para verificarlo luego
            window._pendingSignUp = signUp;
            return { data: { user: null }, error: null }; // user null = "revisa tu correo"
          }

          return { data: null, error: { message: 'No se pudo crear la cuenta' } };
        } catch(e) {
          return { data: null, error: { message: _clerkError(e) } };
        }
      },

      // signOut()
      async signOut() {
        try { await clerk.signOut(); } catch(e) {}
        return { error: null };
      },

      // onAuthStateChange — no aplica en Clerk (polling/events diferente)
      // Se deja como no-op para no romper código que lo llame
      onAuthStateChange(cb) {
        // Clerk notifica via __unstable__onBeforeRequest, usamos polling simple
        return { data: { subscription: { unsubscribe: () => {} } } };
      },

      // updateUser — para cambiar display_name, bio, etc.
      async updateUser(attrs) {
        try {
          if (!clerk.user) return { data: null, error: { message: 'No autenticado' } };
          await clerk.user.update({
            firstName: attrs.data?.display_name || undefined,
            unsafeMetadata: {
              ...clerk.user.unsafeMetadata,
              ...(attrs.data || {}),
            }
          });
          return { data: { user: _clerkUserToSupabase(clerk.user) }, error: null };
        } catch(e) {
          return { data: null, error: { message: _clerkError(e) } };
        }
      }
    };
  }

  // ─── Storage adapter (avatares — no usa Supabase Storage) ────────
  // Los avatares ya están en Cloudflare según el código existente,
  // así que este adapter es un stub que no hace nada.
  function storageAdapter() {
    return {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'Storage no disponible' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      })
    };
  }

  // ─── Convertir usuario de Clerk al formato que espera script.js ──
  // CRÍTICO: usa external_id (= UUID original de Neon) como .id
  // para que TODOS los datos existentes (posts, follows, likes) sigan funcionando.
  function _clerkUserToSupabase(user) {
    if (!user) return null;
    const displayName = user.firstName
      || user.unsafeMetadata?.display_name
      || user.username
      || user.emailAddresses?.[0]?.emailAddress?.split('@')[0]
      || 'usuario';

    return {
      // ⚠️  CLAVE: external_id = UUID original de Neon Auth
      // Para usuarios nuevos (registrados directo en Clerk) no habrá external_id,
      // así que se usa el id de Clerk como fallback.
      id: user.externalId || user.id,

      email: user.emailAddresses?.[0]?.emailAddress || '',
      user_metadata: {
        display_name: displayName,
        avatar_url:   user.imageUrl || null,
        bio:          user.unsafeMetadata?.bio || '',
        username:     user.username || displayName,
      },
      // Guardar el id real de Clerk por si hace falta
      _clerk_id: user.id,
      _external_id: user.externalId,
    };
  }

  function _clerkError(e) {
    if (e?.errors?.length) return e.errors[0].longMessage || e.errors[0].message;
    return e?.message || 'Error desconocido';
  }

  // ─── Exponer window.db ────────────────────────────────────────────
  window.db = makeNeonClient();

  // ─── Disparar evento igual que antes ─────────────────────────────
  document.dispatchEvent(new Event('neon-ready'));

  console.log('[Sigilo] Clerk + Neon inicializados ✅');

}).catch(err => {
  console.error('[Sigilo] Error cargando Clerk SDK:', err);
  const ld = document.getElementById('loading-screen');
  if (ld) {
    ld.innerHTML = `
      <div style="font-family:sans-serif;color:#c66;text-align:center;padding:2rem;max-width:400px">
        <div style="font-size:1.8rem;margin-bottom:1rem">✦ sigilo</div>
        <p>Error al conectar con el sistema de autenticación.<br>Revisa la configuración en <code>clerk-init.js</code>.</p>
        <pre style="font-size:.75rem;text-align:left;background:#1a1a1a;padding:1rem;border-radius:6px;overflow:auto">${err.message}</pre>
        <button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.4rem;background:#c66;color:#fff;border:none;border-radius:6px;cursor:pointer">Reintentar</button>
      </div>`;
  }
});
