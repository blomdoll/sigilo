const supabaseUrl = 'https://mgzbmpcirzeaqfzrpiro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemJtcGNpcnplYXFmenJwaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQzNTgsImV4cCI6MjA5MzE1MDM1OH0.igJ1MqmbOSGCICdzWSqcl58zP7OTMQr3zF_g6t0F_1I';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);
window.db = db;

let offset = 0; 
const PAGE_SIZE = 10;

const S = {
  users: [], 
  posts: [],
  me: null,
  page: 'feed',
  ptab: 'posts',
  puid: null,
  modal: false,
  coOpen: {},
  cat: 'todos',
  menu: null,
  menuPos: null,
  folders: [],
  folderModal: false,
  folderTarget: null,
  folderPostModal: null,
  activeFolderTab: null,
  searchOpen: false,
  editModal: null,
  notifOpen: false,
  notifs: [],
  page_num: 1,
  PAGE_SIZE: 20,
  confirmModal: null,
  composeCat: null, // categoría seleccionada en compose (null = primera por defecto)
  loading: false, // guard para evitar fetchPosts simultáneos
  theme: 'durazno', // tema activo
  pinnedPosts: {}, // { userId: postId } — un post anclado por usuario
  explorePage: false, // si estamos en la página explorar
  feedTab: 'todos', // tab activa en el feed: 'todos' | 'explorar' | 'siguiendo'
  communityPage: false, // si estamos en la sección de comunidad
  communityPosts: [], // posts de comunidad
  communityLoading: false,
  replyTo: {}, // { postId: { cmtId, un } } — comentario al que se responde actualmente
};
window.S = S; // Expone globalmente para script_chat.js y otros módulos

const CATS = ['todos', 'decoraciones', 'letras', 'símbolos', 'biografías', 'usernames', 'nombres'];

// Cache para explorar/destacados
let _exploreCache = null;
let _exploreCacheTs = 0;
const EXPLORE_TTL = 5 * 60 * 1000; // 5 min
const MAX_CHARS = 500;
const uid = () => 'x' + Math.random().toString(36).slice(2);

const ago = ts => {
  if (!ts) return '';
  
  const normalized = (typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+')) ? ts + 'Z' : ts;
  const d = Date.now() - new Date(normalized).getTime();
  if (isNaN(d) || d < 0) return 'ahora';
  if (d < 60000) return 'ahora';
  if (d < 3600000) return ~~(d / 60000) + 'm';
  if (d < 86400000) return ~~(d / 3600000) + 'h';
  if (d < 2592000000) return ~~(d / 86400000) + 'd';
  return new Date(normalized).toLocaleDateString('es', { day:'numeric', month:'short' });
};

const esc = s => s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
const safeId = id => 'p' + String(id).replace(/[^a-zA-Z0-9]/g, '_');

function toast(m, dur=2200) { 
  const t = document.getElementById('toast'); 
  if(t) { t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur); }
}

// --- MODAL DE CONFIRMACION ---
function confirmAction(msg, onConfirm) {
  S.confirmModal = { msg, onConfirm };
  renderConfirmModal();
}

function renderConfirmModal() {
  let el = document.getElementById('confirmModal');
  if (!el) { el = document.createElement('div'); el.id = 'confirmModal'; document.body.appendChild(el); }
  if (!S.confirmModal) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="mov" onclick="if(event.target===this){S.confirmModal=null;renderConfirmModal();}">
    <div class="mdl" style="max-width:340px">
      <div class="mdlt" style="font-size:.95rem">${esc(S.confirmModal.msg)}</div>
      <div class="macts">
        <button class="cancelbtn" onclick="S.confirmModal=null;renderConfirmModal()">cancelar</button>
        <button class="savebtn" style="background:#a33" onclick="(S.confirmModal.onConfirm)();S.confirmModal=null;renderConfirmModal()">eliminar</button>
      </div>
    </div>
  </div>`;
}

// --- SISTEMA DE TEMAS ---
const THEMES = [
  {
    id: 'durazno',
    name: 'Durazno',
    bg: '#FBF6F0', surface: '#FFF9F4', accent: '#C9785A', accent2: '#E8C5A8', tx: '#2C1810',
  },
  {
    id: 'medianoche',
    name: 'Medianoche',
    bg: '#0F0F14', surface: '#16161E', accent: '#8B7CF8', accent2: '#2D2B4E', tx: '#E8E6FF',
  },
  {
    id: 'bosque',
    name: 'Bosque',
    bg: '#F2F5EE', surface: '#F8FAF5', accent: '#5A8A5C', accent2: '#B8D4B9', tx: '#1A2E1B',
  },
  {
    id: 'cielo',
    name: 'Cielo',
    bg: '#F0F5FB', surface: '#F8FAFE', accent: '#4A86C8', accent2: '#A8C8EE', tx: '#0E2040',
  },
  {
    id: 'rosa',
    name: 'Rosa',
    bg: '#FDF0F5', surface: '#FFF5F8', accent: '#C45C80', accent2: '#F0B8CC', tx: '#3A0E22',
  },
  {
    id: 'ambar',
    name: 'Ámbar',
    bg: '#FBF5E8', surface: '#FFFBF0', accent: '#C8880A', accent2: '#EED09A', tx: '#2C1C00',
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    bg: '#F2F3F5', surface: '#FAFBFC', accent: '#5A6E8A', accent2: '#B0BED0', tx: '#0A1828',
  },
  {
    id: 'nocturno',
    name: 'Nocturno',
    bg: '#130E0A', surface: '#1C1410', accent: '#D4956A', accent2: '#3A2618', tx: '#F0E8DE',
  },
];

function applyTheme(themeId) {
  S.theme = themeId;
  document.documentElement.setAttribute('data-theme', themeId);
  try { localStorage.setItem('sigilo_theme', themeId); } catch(e) {}
}

function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('sigilo_theme');
    if (saved && THEMES.find(t => t.id === saved)) {
      applyTheme(saved);
      return;
    }
  } catch(e) {}
  applyTheme('durazno');
}

// Aplicar tema guardado inmediatamente
loadSavedTheme();

// --- NAVEGACIÓN A CONFIGURACIÓN ---
function gosettings() {
  S.page = 'settings'; S.menu = null;
  renderPostMenu();
  document.title = 'ajustes · sigilo';
  // Actualizar nav
  ['nf','ne','ncom','np','nc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'nbtn';
  });
  const nc = document.getElementById('nc');
  if (nc) nc.className = 'nbtn on';
  // Renderizar
  const mc = document.getElementById('mc');
  if (mc) mc.innerHTML = rsettings();
  // Guardar estado
  try { sessionStorage.setItem('sigilo_nav', JSON.stringify({ page: 'settings' })); } catch(e) {}
}

function rsettings() {
  return `
  <div class="settings-page">
    <div class="settings-title">ajustes</div>
    <div class="settings-sub">personaliza tu experiencia en sigilo</div>

    <div class="settings-section">
      <div class="settings-section-title">✦ tema de color</div>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <div class="theme-card${S.theme === t.id ? ' active' : ''}" onclick="selectTheme('${t.id}')" title="${t.name}">
            <div class="theme-preview" style="background:${t.bg}">
              <div class="theme-preview-dot" style="background:${t.accent}"></div>
              <div class="theme-preview-bar" style="background:${t.surface};border:1px solid ${t.accent2};width:75%"></div>
              <div class="theme-preview-bar" style="background:${t.accent2};width:55%"></div>
              <div class="theme-preview-bar" style="background:${t.accent};width:38%"></div>
            </div>
            <div class="theme-label" style="background:${t.surface};color:${t.tx}">
              <span>${t.name}</span>
              <span class="theme-check" style="color:${t.accent}">✓</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function selectTheme(themeId) {
  applyTheme(themeId);
  // Re-render solo la grilla sin recargar toda la página
  const grid = document.querySelector('.theme-grid');
  if (grid) {
    grid.querySelectorAll('.theme-card').forEach(card => {
      const isActive = card.getAttribute('onclick') === `selectTheme('${themeId}')`;
      card.classList.toggle('active', isActive);
    });
  }
  toast('tema aplicado ✦');
}

// --- AUTH ---
function stab(tab) {
  const lf = document.getElementById('lf'), rf = document.getElementById('rf');
  const tl = document.getElementById('tl'), tr = document.getElementById('tr');
  if (tab === 'login') { lf.style.display='block'; rf.style.display='none'; tl.classList.add('on'); tr.classList.remove('on'); }
  else { lf.style.display='none'; rf.style.display='block'; tr.classList.add('on'); tl.classList.remove('on'); }
}

async function login() {
  const email = document.getElementById('lu').value.trim();
  const password = document.getElementById('lp').value;
  const btn = document.querySelector('#lf .btn-fill');
  if (btn) { btn.textContent = 'ingresando...'; btn.disabled = true; }
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
  if (error) document.getElementById('le').textContent = 'Error: ' + error.message;
  else { S.me = data.user; boot(); }
}

async function register() {
  const email = document.getElementById('re').value.trim();
  const password = document.getElementById('rp').value;
  const username = document.getElementById('ru').value.trim();
  const errEl = document.getElementById('ree');
  errEl.textContent = '';

  if (!username) { errEl.textContent = 'El nombre de usuario es obligatorio.'; return; }
  if (username.length < 3) { errEl.textContent = 'El nombre de usuario debe tener al menos 3 caracteres.'; return; }
  if (!email) { errEl.textContent = 'El correo electrónico es obligatorio.'; return; }
  if (!password) { errEl.textContent = 'La contraseña es obligatoria.'; return; }
  if (password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

  const btn = document.querySelector('#rf .btn-fill');
  if (btn) { btn.textContent = 'verificando...'; btn.disabled = true; }

  // Verificar que el username no esté en uso
  const { data: existingUser } = await db.from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  if (existingUser) {
    errEl.textContent = 'Ese nombre de usuario ya está en uso. Elige otro.';
    if (btn) { btn.textContent = 'Crear cuenta'; btn.disabled = false; }
    return;
  }

  if (btn) { btn.textContent = 'creando cuenta...'; }
  const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: username } } });
  if (btn) { btn.textContent = 'Crear cuenta'; btn.disabled = false; }
  if (error) { errEl.textContent = error.message; return; }
  // Crear fila en profiles para que el usuario sea buscable desde el primer momento
  if (data.user) {
    try {
      await db.from('profiles').upsert([{
        id: data.user.id,
        username,
        display_name: username,
        avatar_url: null,
        bio: '',
      }], { onConflict: 'id' });
    } catch(e) { /* no bloquear el registro si falla */ }
    S.me = data.user;
    boot();
  } else {
    // Supabase devuelve user=null cuando la confirmación de correo está activa
    toast('¡Cuenta creada! Revisa tu correo para confirmar y luego inicia sesión.');
    stab('login');
  }
}

function showLoading() {
  const auth = document.getElementById('auth');
  const app = document.getElementById('app');
  if (auth) auth.style.display = 'none';
  if (app) app.style.display = 'none';
  let ld = document.getElementById('loading-screen');
  if (!ld) {
    ld = document.createElement('div');
    ld.id = 'loading-screen';
    ld.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);z-index:999;gap:1.2rem;';
    ld.innerHTML = `<div style="font-family:var(--fd);font-size:2.2rem;color:var(--w1)">sigilo</div><div class="loading-dots"><span></span><span></span><span></span></div>`;
    document.body.appendChild(ld);
  }
  ld.style.display = 'flex';
}

function hideLoading() {
  const ld = document.getElementById('loading-screen');
  if (ld) ld.style.display = 'none';
}

async function refreshMyAvatarUrl() {
  // Si el usuario tiene un avatar_path guardado, generamos una URL firmada fresca
  const path = S.me?.user_metadata?.avatar_path;
  if (!path) return;
  try {
    const { data, error } = await db.storage.from('avatars').createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) {
      S.me.user_metadata.avatar_url = data.signedUrl;
      _avatarCache[S.me.id] = { url: data.signedUrl, expira: Date.now() + 55 * 60 * 1000 };
    }
  } catch(e) {}
}

async function boot() {
  hideLoading();
  document.getElementById('auth').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex'; app.style.flexDirection = 'column'; app.style.minHeight = '100%';

  // Inicializar el estado del historial para que popstate funcione desde el primer momento
  try {
    if (!history.state) {
      history.replaceState({ page: 'feed', puid: null, ptab: 'posts' }, '', window.location.pathname);
    }
  } catch(e) {}

  // Refrescar URL firmada del avatar al iniciar sesión (reduce egress público)
  refreshMyAvatarUrl();

  // Sincronizar bio desde profiles al arranque (por si auth no tiene el campo bio)
  // Esto garantiza que S._profileBio esté disponible aunque el usuario no abra el modal
  if (!S.me.user_metadata?.bio) {
    db.from('profiles').select('bio').eq('id', S.me.id).single().then(({ data }) => {
      if (data?.bio) {
        S._profileBio = data.bio;
        // Intentar sincronizar con auth en background
        db.auth.updateUser({ data: { bio: data.bio } }).catch(() => {});
      }
    }).catch(() => {});
  } else {
    S._profileBio = S.me.user_metadata.bio;
  }

  // ── ANUNCIOS: iniciar sistema de popup al arrancar ──────────────
  // Para publicar un anuncio, edita ANNOUNCE_CONFIG en script_announce.js
  if (typeof initAnnounce === 'function') initAnnounce();
  // ───────────────────────────────────────────────────────────────

  // Restaurar la pagina donde estaba el usuario antes de refrescar
  try {
    const saved = JSON.parse(sessionStorage.getItem('sigilo_nav') || 'null');
    if (saved && saved.page === 'profile' && saved.puid) {
      S.page = 'profile';
      S.puid = saved.puid;
      S.ptab = saved.ptab || 'posts';
      nav();
      // Mostrar skeleton mientras cargamos datos del perfil
      const mc = document.getElementById('mc');
      if (mc) {
        const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
        mc.innerHTML = `<div class="ppage" style="padding-top:1.25rem"><div class="pavwrap"><div class="pav" style="background:var(--w3)"></div></div><div class="pinfo" style="text-align:center;padding:0 1rem"><div style="height:1.2rem;width:120px;background:var(--w3);border-radius:8px;margin:.5rem auto"></div><div style="height:.85rem;width:200px;background:var(--w3);border-radius:8px;margin:.4rem auto .9rem"></div></div>${sk.repeat(3)}</div>`;
      }
      // Si es perfil ajeno, fetchear datos antes de renderizar
      if (saved.puid !== S.me?.id) {
        try {
          const { data } = await db.from('profiles')
            .select('id,username,display_name,avatar_url,avatar_path,bio')
            .eq('id', saved.puid).single();
          if (data) {
            let avatarUrl = data.avatar_url;
            if (data.avatar_path) {
              const signed = await getSignedAvatarUrl(data.id, data.avatar_path);
              if (signed) avatarUrl = signed;
            }
            const profile = {
              id: data.id,
              username: data.display_name || data.username,
              display_name: data.display_name || data.username,
              avatar_url: avatarUrl,
              bio: data.bio || '',
              _ts: Date.now()
            };
            const existing = S.users.findIndex(u => u.id === saved.puid);
            if (existing > -1) S.users[existing] = profile; else S.users.push(profile);
          }
        } catch(e) {}
      }
      render();
      fetchProfilePosts(saved.puid);
      fetchFolders();
      loadNotifs();
      return;
    }
    if (saved && saved.page === 'explore') {
      fetchFolders();
      loadNotifs();
      loadPinnedPosts();
      goExplore();
      return;
    }
    if (saved && saved.page === 'settings') {
      S.page = 'settings';
      nav(); render();
      fetchFolders();
      loadNotifs();
      return;
    }
  } catch(e) {}

  // ── DEEP LINK: ?post=ID ──────────────────────────────────────────
  // Si la URL contiene ?post=<id>, mostrar ese post de forma destacada
  // en el feed y hacer scroll hasta él automáticamente.
  const _urlParams = new URLSearchParams(window.location.search);
  const _deepPostId = _urlParams.get('post');
  if (_deepPostId) {
    // Limpiar el parámetro de la URL sin recargar (evita que quede pegado)
    try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
    S.page = 'feed'; S.puid = null; S.explorePage = false;
    loadPinnedPosts();
    nav();
    // Mostrar skeletons mientras carga
    const mc = document.getElementById('mc');
    if (mc) {
      const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
      mc.innerHTML = `<div class="ftitle">inicio</div><div class="fsub">comparte decoraciones, letras, símbolos y más</div>${sk.repeat(4)}`;
    }
    // Cargar el post específico primero, luego el feed completo
    (async () => {
      try {
        const postIdNum = isNaN(_deepPostId) ? _deepPostId : Number(_deepPostId);
        // Intentar traer el post por su ID directamente
        const { data: pdata } = await db.from('posts').select('*').eq('id', postIdNum).single();
        if (pdata) {
          const linked = { ...pdata, likes: Array.isArray(pdata.likes)?pdata.likes:[], cmts: Array.isArray(pdata.cmts)?pdata.cmts:[], saved: Array.isArray(pdata.saved)?pdata.saved:[], t: pdata.created_at };
          // Insertar al inicio si no existe aún
          if (!S.posts.find(x => x.id === linked.id)) S.posts.unshift(linked);
        }
      } catch(e) {}
      await fetchPosts(true);
      // Una vez renderizado, hacer scroll y resaltar el post
      setTimeout(() => {
        const targetId = isNaN(_deepPostId) ? _deepPostId : Number(_deepPostId);
        const el = document.getElementById('post-' + safeId(targetId));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight');
          setTimeout(() => el.classList.remove('highlight'), 2200);
        }
      }, 350);
    })();
    fetchFolders();
    loadNotifs();
    startTimestampRefresh();
    return;
  }
  // ────────────────────────────────────────────────────────────────

  // Mostrar feed con skeletons mientras carga
  S.page = 'feed';
  S.puid = null; // explícito: en feed no hay perfil activo
  S.explorePage = false;
  loadPinnedPosts();
  nav();
  // Renderizar estructura del feed con skeletons
  const mc = document.getElementById('mc');
  if (mc) {
    const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
    mc.innerHTML = `
      <div class="ftitle">inicio</div>
      <div class="fsub">comparte decoraciones, letras, símbolos y más</div>
      ${sk.repeat(4)}`;
  }
  fetchPosts();
  fetchFolders();
  loadNotifs();
  startTimestampRefresh();
}

// Refresca los timestamps visibles cada 60s sin re-render completo
let _tsInterval = null;
function startTimestampRefresh() {
  if (_tsInterval) clearInterval(_tsInterval);
  _tsInterval = setInterval(() => {
    document.querySelectorAll('.ptime').forEach(el => {
      const ts = el.dataset.ts;
      if (ts) el.textContent = ago(ts);
    });
    document.querySelectorAll('.cmt-time').forEach(el => {
      const ts = el.dataset.ts;
      if (ts) el.textContent = ago(ts);
    });
    document.querySelectorAll('.notif-time').forEach(el => {
      const ts = el.dataset.ts;
      if (ts) el.textContent = ago(ts);
    });
  }, 60000);
}

async function fetchPosts(reset = true) {
  if (S.loading) return; // guard: evitar llamadas simultáneas
  S.loading = true;

  if (reset) {
    S.page_num = 1;
    offset = 0;
  }

  const desde = offset;
  const hasta = desde + PAGE_SIZE - 1;

  let data, error;
  try {
    ({ data, error } = await db
      .from('posts')
      .select('*')
      .or('is_community.is.null,is_community.eq.false')
      .order('created_at', { ascending: false })
      .range(desde, hasta));
  } catch(e) {
    error = e;
  }

  S.loading = false;

  if (error) {
    console.error('Error en el feed:', error);
    // Mostrar error visible al usuario si el feed está vacío
    const mc = document.getElementById('mc');
    if (mc && S.posts.length === 0) {
      mc.innerHTML = `<div class="empty"><div class="ei">⚠️</div><div class="el">no se pudo cargar el feed. ¡revisa tu conexión e intenta de nuevo!<br><br><button class="load-more-btn" onclick="fetchPosts()">reintentar</button></div></div>`;
    }
    return;
  }

  if (data && data.length > 0) {
    const newPosts = data.map(p => ({
      ...p,
      likes: Array.isArray(p.likes) ? p.likes : [],
      cmts: Array.isArray(p.cmts) ? p.cmts : [],
      saved: Array.isArray(p.saved) ? p.saved : [],
      t: p.created_at
    }));

    if (reset) {
      S.posts = newPosts;
    } else {
      const existingIds = new Set(S.posts.map(p => p.id));
      const filteredNew = newPosts.filter(p => !existingIds.has(p.id));
      S.posts = [...S.posts, ...filteredNew];
    }

    offset += data.length;
    render();
    setTimeout(setupInfiniteScroll, 100);
  } else if (reset && data && data.length === 0) {
    // No hay posts en absoluto
    render();
  }
}

async function fetchProfilePosts(userId) {
  try {
    const { data, error } = await db.from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return;
    // Mezclar con S.posts sin duplicar
    const existingIds = new Set(S.posts.map(p => p.id));
    const newPosts = data
      .map(p => ({
        ...p,
        likes: Array.isArray(p.likes) ? p.likes : [],
        cmts: Array.isArray(p.cmts) ? p.cmts : [],
        saved: Array.isArray(p.saved) ? p.saved : [],
        t: p.created_at
      }))
      .filter(p => !existingIds.has(p.id));
    S.posts = [...newPosts, ...S.posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (S.page === 'profile' && S.puid === userId) render();
  } catch(e) {}
}
window.fetchProfilePosts = fetchProfilePosts;

async function loadMore() {
  const btn = document.querySelector('.load-more-btn');
  if (btn) { btn.textContent = 'cargando...'; btn.disabled = true; }
  
  await fetchPosts(false); // Llamamos con reset=false para que sume al offset
  
  if (btn) { btn.textContent = 'cargar más'; btn.disabled = false; }
}

async function logout() {
  unsubscribeNotifs();
  if (_tsInterval) { clearInterval(_tsInterval); _tsInterval = null; }
  if (_sentinel) { _sentinel.disconnect(); _sentinel = null; }
  await db.auth.signOut();
  S.me = null; S.notifs = []; S.notifOpen = false;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('lu').value = ''; document.getElementById('lp').value = '';
  stab('login');
  // Limpiar historial para que atrás no vuelva a una página protegida
  try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
}

// --- NOTIFICACIONES (Supabase Realtime) ---
// Requiere tabla en Supabase:
// notifications(id uuid pk default gen_random_uuid(), to_uid text, from_uid text,
//   from_name text, type text, post_id text, post_body text,
//   read bool default false, created_at timestamptz default now())
// RLS: SELECT where to_uid = auth.uid()

let _notifChannel = null;

async function loadNotifs() {
  if (!S.me) return;
  try {
    const { data } = await db.from('notifications')
      .select('*')
      .eq('to_uid', S.me.id)
      .order('created_at', { ascending: false })
      .limit(50);
    S.notifs = (data || []).map(n => ({
      id: n.id,
      type: n.type,
      fromUid: n.from_uid,
      fromName: n.from_name,
      postId: n.post_id,
      postBody: n.post_body,
      ts: n.created_at,
      read: n.read,
    }));
  } catch(e) { S.notifs = []; }
  renderNotifBadge();
  subscribeNotifs();
}

function subscribeNotifs() {
  if (_notifChannel) return;
  _notifChannel = db.channel('notifs_' + S.me.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `to_uid=eq.${S.me.id}`,
    }, payload => {
      const n = payload.new;
      S.notifs.unshift({
        id: n.id, type: n.type,
        fromUid: n.from_uid, fromName: n.from_name,
        postId: n.post_id, postBody: n.post_body,
        ts: n.created_at, read: false,
      });
      renderNotifBadge();
      if (S.notifOpen) renderNotifPanel();
    })
    .subscribe();
}

function unsubscribeNotifs() {
  if (_notifChannel) { db.removeChannel(_notifChannel); _notifChannel = null; }
}

async function saveNotif(toUid, type, fromName, postId, postBody) {
  try {
    await db.from('notifications').insert([{
      to_uid: toUid,
      from_uid: S.me.id,
      from_name: fromName,
      type,
      post_id: String(postId),
      post_body: (postBody || '').slice(0, 120),
      read: false,
    }]);
  } catch(e) {}
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const count = S.notifs.filter(n => !n.read).length;
  badge.textContent = count > 9 ? '9+' : (count || '');
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function toggleNotif() {
  // Cerrar búsqueda si está abierta (mutuamente excluyentes)
  if (S.searchOpen) toggleSearch();
  mobCloseSearch();
  S.notifOpen = !S.notifOpen;
  if (S.notifOpen) {
    const unreadIds = S.notifs.filter(n => !n.read).map(n => n.id);
    S.notifs.forEach(n => n.read = true);
    renderNotifBadge();
    // Marcar como leídas en Supabase (sin await para no bloquear UI)
    if (unreadIds.length > 0) {
      db.from('notifications').update({ read: true }).in('id', unreadIds).then(() => {});
    }
  }
  renderNotifPanel();
}

function renderNotifPanel() {
  let el = document.getElementById('notifPanel');
  if (!el) { el = document.createElement('div'); el.id = 'notifPanel'; document.body.appendChild(el); }
  if (!S.notifOpen) { el.innerHTML = ''; const _bd=document.getElementById('notifBackdrop'); if(_bd) _bd.style.display='none'; return; }
  // Backdrop para móvil — toque fuera cierra el panel
  let bd = document.getElementById('notifBackdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'notifBackdrop';
    bd.style.cssText = 'position:fixed;inset:0;z-index:69;display:none;';
    bd.addEventListener('click', () => { S.notifOpen=false; renderNotifPanel(); });
    document.body.appendChild(bd);
  }
  bd.style.display = 'block';
  const items = S.notifs.length === 0
    ? `<div class="s-empty" style="padding:1.2rem .6rem">sin notificaciones aún</div>`
    : S.notifs.slice(0,20).map(n => `
      <div class="notif-row" onclick="goNotif('${n.postId}')">
        <span class="notif-icon">${n.type==='like'?'♡':'◌'}</span>
        <div class="notif-body">
          <span class="notif-name">${esc(n.fromName)}</span>
          ${n.type==='like'?' le dio like a tu publicación':' comentó en tu publicación'}
          ${n.postBody?`<div class="notif-preview">${esc(n.postBody)}</div>`:''}
        </div>
        <span class="notif-time" data-ts="${n.ts}">${ago(n.ts)}</span>
      </div>`).join('');
  el.innerHTML = `<div class="notif-panel" onclick="event.stopPropagation()">
    <div class="notif-head">
      <span>notificaciones</span>
      ${S.notifs.length>0?`<button class="notif-clear" onclick="event.stopPropagation();clearNotifs()">limpiar</button>`:''}
    </div>
    <div class="notif-list">
      ${items}
    </div>
  </div>`;
}

function clearNotifs() {
  db.from('notifications').delete().eq('to_uid', S.me.id).then(() => {});
  S.notifs=[]; renderNotifBadge(); renderNotifPanel();
}

function goNotif(postId) {
  S.notifOpen = false; renderNotifPanel();
  gofeed();
  setTimeout(() => {
    const el = document.getElementById('post-' + safeId(postId));
    if (el) { el.scrollIntoView({ behavior:'smooth', block:'center' }); el.classList.add('highlight'); setTimeout(()=>el.classList.remove('highlight'),1800); }
  }, 200);
}

// --- CARPETAS ---
async function fetchFolders() {
  try {
    const { data, error } = await db.from('folders').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      S.folders = data;
      // Solo re-renderizar si S.puid está correctamente seteado
      // (evita que el render async pise el estado de perfil con puid=null)
      if (S.page !== 'profile' || S.puid) render();
    }
  } catch(e) { S.folders = []; }
}

async function createFolder(name) {
  if (!name || !name.trim()) return;
  try {
    const { data, error } = await db.from('folders').insert([{ name: name.trim(), user_id: S.me.id }]).select();
    if (error) throw error;
    if (data && data[0]) S.folders.push(data[0]);
  } catch(e) {
    S.folders.push({ id: uid(), name: name.trim(), user_id: S.me.id, created_at: new Date().toISOString() });
  }
  toast('carpeta creada'); S.folderModal = false; render();
}

async function renameFolder(id, name) {
  if (!name || !name.trim()) return;
  try { await db.from('folders').update({ name: name.trim() }).eq('id', id); } catch(e) {}
  const f = S.folders.find(x => x.id === id); if (f) f.name = name.trim();
  S.folderModal = false; S.folderTarget = null;
  toast('carpeta renombrada'); render();
}

async function deleteFolder(id) {
  try {
    await db.from('folders').delete().eq('id', id);
    const affected = S.posts.filter(p => p.folder_id === id && p.user_id === S.me.id);
    for (const p of affected) { p.folder_id = null; await db.from('posts').update({ folder_id: null }).eq('id', p.id); }
  } catch(e) {}
  S.folders = S.folders.filter(x => x.id !== id);
  if (S.activeFolderTab === id) S.activeFolderTab = null;
  S.menu = null; toast('carpeta eliminada'); render();
}

async function assignToFolder(postId, folderId) {
  postId = isNaN(postId) ? postId : Number(postId);
  const p = findPost(postId); if (!p) return;
  const newFolder = p.folder_id === folderId ? null : folderId;
  p.folder_id = newFolder;
  if (newFolder) p.col = true;
  try { await db.from('posts').update({ folder_id: newFolder, col: p.col }).eq('id', postId); } catch(e) {}
  S.folderPostModal = null; toast(newFolder ? 'añadido a carpeta' : 'eliminado de carpeta'); render();
}

function openFolderPicker(postId) { S.folderPostModal = isNaN(postId)?postId:Number(postId); S.menu=null; render(); }
function closeFolderPicker() { S.folderPostModal = null; render(); }
function openCreateFolder() { S.folderModal = 'create'; S.folderTarget = null; render(); }
function openRenameFolder(id) { S.folderModal = 'rename'; S.folderTarget = id; render(); }
function closeFolderForm() { S.folderModal = false; S.folderTarget = null; render(); }
function toggleFolderView(id) { S.activeFolderTab = S.activeFolderTab===id?null:id; render(); }

// --- BUSQUEDA ---
function toggleSearch() {
  // Cerrar notifs si están abiertas (mutuamente excluyentes)
  if (S.notifOpen) { S.notifOpen = false; renderNotifPanel(); }
  S.searchOpen = !S.searchOpen;
  const overlay = document.getElementById('searchOverlay');
  if (!overlay) return;
  if (S.searchOpen) {
    overlay.style.display = 'block';
    setTimeout(() => document.getElementById('searchInput')?.focus(), 50);
  } else {
    overlay.style.display = 'none';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const res = document.getElementById('searchResults');
    if (res) res.innerHTML = '';
  }
}

let searchTimeout = null;
async function searchUsers() {
  const q = document.getElementById('searchInput')?.value?.trim();
  const res = document.getElementById('searchResults');
  if (!res) return;
  if (!q) { res.innerHTML = ''; return; }
  res.innerHTML = `<div class="s-empty">buscando...</div>`;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const { data, error } = await db.from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10);
      if (error || !data || data.length === 0) {
        res.innerHTML = `<div class="s-empty">no se encontraron usuarios</div>`; return;
      }
      // Resolver URLs de avatar (puede requerir URL firmada)
      const usersWithAv = await Promise.all(data.map(async u => {
        let av = u.avatar_url;
        if (u.avatar_path) {
          const signed = await getSignedAvatarUrl(u.id, u.avatar_path);
          if (signed) av = signed;
        }
        return { ...u, _resolved_av: av };
      }));
      res.innerHTML = usersWithAv.map(u => {
        const name = u.display_name || u.username || '?';
        const ini = (name[0]||'?').toUpperCase().replace(/'/g,'&#39;');
        const av = u._resolved_av;
        return `<div class="s-row" onclick="goSearchUser('${u.id}')">
          ${avEl({ display_name: name, avatar_url: av })}
          <span class="s-name">${esc(name)}</span>
        </div>`;
      }).join('');
    } catch(e) {
      res.innerHTML = `<div class="s-empty">error al buscar, intenta de nuevo</div>`;
    }
  }, 300);
}

function goSearchUser(id) { toggleSearch(); vprof(id); }

// --- NAVEGACION ---
function saveNavState() {
  const state = { page: S.page, puid: S.puid, ptab: S.ptab };
  try { sessionStorage.setItem('sigilo_nav', JSON.stringify(state)); } catch(e) {}
  // Integrar con History API para que el botón atrás del browser funcione
  try {
    const current = history.state;
    const isSameState = current && current.page === state.page && current.puid === state.puid;
    if (!isSameState) {
      history.pushState(state, '', window.location.pathname);
    }
  } catch(e) {}
}

// Manejar el botón atrás / adelante del navegador
window.addEventListener('popstate', (e) => {
  const state = e.state;
  if (!state || !S.me) return;
  if (state.page === 'feed') {
    S.page = 'feed'; S.explorePage = false; S.feedTab = 'todos'; S.puid = null; S.menu = null;
    renderPostMenu(); document.title = 'inicio · sigilo'; nav(); render();
  } else if (state.page === 'explore') {
    goExplore();
  } else if (state.page === 'profile' && state.puid) {
    if (state.puid === S.me.id) {
      S.page = 'profile'; S.puid = S.me.id; S.ptab = state.ptab || 'posts'; S.menu = null;
      renderPostMenu(); document.title = 'perfil · sigilo'; nav(); render();
      fetchProfilePosts(S.me.id);
    } else {
      vprof(state.puid);
    }
  } else if (state.page === 'settings') {
    gosettings();
  }
});

function gofeed() { S.page='feed'; S.explorePage=false; S.communityPage=false; S.feedTab='todos'; S.puid=null; S.menu=null; renderPostMenu(); saveNavState(); document.title='inicio · sigilo'; nav(); render(); }

async function goCommunity() {
  S.page = 'community'; S.explorePage = false; S.communityPage = true; S.puid = null; S.menu = null;
  renderPostMenu(); saveNavState(); document.title = 'comunidad · sigilo'; nav();
  const mc = document.getElementById('mc');
  if (mc) {
    const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
    mc.innerHTML = `<div class="ftitle">comunidad</div><div class="fsub">búsquedas, conversaciones y todo lo del sitio</div>${sk.repeat(4)}`;
  }
  await fetchCommunityPosts();
  renderCommunity();
}

async function fetchCommunityPosts(reset = true) {
  if (S.communityLoading) return;
  S.communityLoading = true;
  try {
    const { data, error } = await db
      .from('posts')
      .select('*')
      .eq('is_community', true)
      .order('created_at', { ascending: false })
      .range(0, 29);
    if (!error && data) {
      S.communityPosts = data.map(p => ({
        ...p,
        likes: Array.isArray(p.likes) ? p.likes : [],
        cmts: Array.isArray(p.cmts) ? p.cmts : [],
        saved: Array.isArray(p.saved) ? p.saved : [],
        t: p.created_at
      }));
    }
  } catch(e) { console.error(e); }
  S.communityLoading = false;
}

function renderCommunity() {
  if (S.page !== 'community') return;
  const mc = document.getElementById('mc');
  if (!mc) return;
  const posts = S.communityPosts;
  mc.innerHTML = `
    <div class="ftitle">comunidad</div>
    <div class="fsub">búsquedas, conversaciones y todo lo del sitio</div>
    <div class="compose">
      <div class="compose-head">${avEl(S.me)}<textarea id="ct-comm" class="ct" placeholder="inicia una conversación, haz una búsqueda..." maxlength="${MAX_CHARS}" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'"></textarea></div>
      <div class="compose-foot">
        <span class="char-count" id="cc-comm">0/${MAX_CHARS}</span>
        <button class="pbtn" onclick="postCommunity()">publicar</button>
      </div>
    </div>
    ${posts.length === 0
      ? `<div class="empty"><div class="ei">💬</div><div class="el">aún no hay publicaciones en comunidad — ¡sé el primero!</div></div>`
      : posts.map(rpost).join('')
    }`;
  // Char counter
  const ta = document.getElementById('ct-comm');
  const cc = document.getElementById('cc-comm');
  if (ta && cc) {
    ta.addEventListener('input', () => { cc.textContent = ta.value.length + '/' + MAX_CHARS; });
  }
}

async function postCommunity() {
  const ta = document.getElementById('ct-comm');
  if (!ta) return;
  const txt = ta.value.trim();
  if (!txt) return toast('escribe algo primero');
  if (txt.length > MAX_CHARS) return toast('máximo ' + MAX_CHARS + ' caracteres');
  const btn = document.querySelector('.pbtn');
  if (btn) { btn.textContent = 'publicando...'; btn.disabled = true; }
  const { data, error } = await db.from('posts').insert([{
    body: txt,
    category: 'comunidad',
    is_community: true,
    user_id: S.me.id,
    username: S.me.user_metadata?.display_name || S.me.email,
    author_av: S.me.user_metadata?.avatar_url || null
  }]).select();
  if (btn) { btn.textContent = 'publicar'; btn.disabled = false; }
  if (error) { toast('Error: ' + error.message); return; }
  if (data && data[0]) {
    const np = { ...data[0], likes: [], cmts: [], saved: [], t: data[0].created_at };
    S.communityPosts.unshift(np);
  }
  // Re-render wherever community is shown (feed tab or standalone page)
  if (S.page === 'community') {
    renderCommunity();
  } else {
    render();
  }
  setTimeout(() => {
    const ta = document.getElementById('ct-comm');
    if (ta) ta.value = '';
    const cc = document.getElementById('cc-comm');
    if (cc) cc.textContent = '0/' + MAX_CHARS;
    const first = document.querySelector('.pcard');
    if (first) { first.classList.add('new-post'); setTimeout(() => first.classList.remove('new-post'), 400); }
  }, 30);
}
window.goCommunity = goCommunity;
window.postCommunity = postCommunity;
window.renderCommunity = renderCommunity;
function goprofile() {
  const myId = S.me.id;
  S.page = 'profile'; S.explorePage = false; S.puid = myId; S.ptab = 'posts'; S.menu = null;
  renderPostMenu(); saveNavState(); document.title = 'perfil · sigilo'; nav(); render();
  fetchProfilePosts(myId);
  if (!S.me.user_metadata?.bio && !S._profileBio) {
    db.from('profiles').select('bio').eq('id', myId).single().then(({ data }) => {
      if (data?.bio) { S._profileBio = data.bio; if (S.page === 'profile' && S.puid === myId) render(); }
    }).catch(() => {});
  }
}
async function vprof(id) {
  S.page='profile'; S.explorePage=false; S.puid=id; S.ptab='posts'; S.menu=null; saveNavState(); document.title='perfil · sigilo'; nav();
  // Render inmediato con lo que hay (puede estar vacío → se ve "cargando...")
  render();
  // Para perfiles ajenos: re-fetchear si los datos tienen más de 10 min o no existen
  if (id !== S.me.id) {
    const cached = S.users.find(u => u.id === id);
    const stale = !cached || !cached._ts || (Date.now() - cached._ts) > 10 * 60 * 1000;
    if (stale) {
      try {
        const { data } = await db.from('profiles')
          .select('id,username,display_name,avatar_url,avatar_path,bio')
          .eq('id', id).single();
        if (data) {
          // Si tiene avatar_path, usar URL del caché firmado (o generarla fresca)
          let avatarUrl = data.avatar_url;
          if (data.avatar_path) {
            const signed = await getSignedAvatarUrl(data.id, data.avatar_path);
            if (signed) avatarUrl = signed;
          }
          const profile = {
            id: data.id,
            username: data.display_name || data.username,
            display_name: data.display_name || data.username,
            avatar_url: avatarUrl,
            bio: data.bio || '',
            _ts: Date.now()
          };
          const existing = S.users.findIndex(u => u.id === id);
          if (existing > -1) S.users[existing] = profile; else S.users.push(profile);
          // Re-render para mostrar bio y avatar recién cargados
          if (S.page === 'profile' && S.puid === id) render();
        }
      } catch(e) {}
    }
  }
  fetchProfilePosts(id);
}

function nav() {
  ['nf','ne','ncom','np','nc'].forEach(id => { const el=document.getElementById(id); if(el) el.className='nbtn'; });
  if (S.explorePage) { const el=document.getElementById('ne'); if(el) el.className='nbtn on'; }
  else if (S.communityPage) { const el=document.getElementById('ncom'); if(el) el.className='nbtn on'; }
  else if (S.page === 'feed') { const el=document.getElementById('nf'); if(el) el.className='nbtn on'; }
  else if (S.page === 'profile') { const el=document.getElementById('np'); if(el) el.className='nbtn on'; }
  else if (S.page === 'settings') { const el=document.getElementById('nc'); if(el) el.className='nbtn on'; }
}

function avEl(user, big = false, canEdit = false) {
  const cls = big ? 'pav' : 'av';
  // Obtenemos el nombre para las iniciales
  const name = user?.user_metadata?.display_name || user?.display_name || user?.name || user?.username || user?.email || '?';
  const ini = (name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?').replace(/'/g, '&#39;');
  
  // Buscamos la URL del avatar en las distintas propiedades posibles
  const avatarUrl = user?.user_metadata?.avatar_url || user?.avatar_url || user?.av || null;
  
  // Solo mostramos el overlay de "cambiar foto" si es el perfil grande Y el usuario tiene permiso
  const overlay = (big && canEdit) ? '<div class="pavov">cambiar foto</div>' : '';

  if (avatarUrl) {
    // onerror usa una función global para evitar problemas de escaping de comillas en el atributo
    const safeUrl = esc(avatarUrl);
    return `<div class="${cls}"><img src="${safeUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.dataset.ini=this.parentNode.dataset.ini||'${ini}';if(!this.parentNode.querySelector('span')){var s=document.createElement('span');s.textContent=this.parentNode.dataset.ini||'?';this.parentNode.appendChild(s);}"/>${overlay}</div>`;
  }
  return `<div class="${cls}"><span>${ini}</span>${overlay}</div>`;
}

function render() {
  const mc = document.getElementById('mc');
  if (mc) {
    if (S.page === 'settings') mc.innerHTML = rsettings();
    else if (S.page === 'community') renderCommunity();
    else mc.innerHTML = S.page==='feed' ? rfeed() : rprofile();
  }
  renderFolderPickerModal();
  renderFolderFormModal();
  renderEditModal();
  renderNotifPanel();
  renderConfirmModal();
  renderNotifBadge();
  renderPostMenu();
  attachTextareaResize();
  if (S.page === 'feed') setTimeout(setupInfiniteScroll, 60);
}

function attachTextareaResize() {
  const ta = document.getElementById('ct');
  if (!ta || ta._resizeAttached) return;
  ta._resizeAttached = true;
  // Expand on focus (especially helpful on mobile)
  ta.addEventListener('focus', () => {
    if (ta.offsetHeight < 100) { ta.style.minHeight = '110px'; }
  });
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const cnt = document.getElementById('char-count');
    if (cnt) {
      const rem = MAX_CHARS - ta.value.length;
      cnt.textContent = rem;
      cnt.className = 'char-count' + (rem < 50 ? ' warn' : '') + (rem < 0 ? ' over' : '');
    }
  });
}

// --- MODALES ---
function renderFolderPickerModal() {
  let el = document.getElementById('folderPickerModal');
  if (!el) { el = document.createElement('div'); el.id='folderPickerModal'; document.body.appendChild(el); }
  if (S.folderPostModal === null) { el.innerHTML=''; return; }
  const post = findPost(S.folderPostModal);
  const myFolders = S.folders.filter(f => f.user_id === S.me.id);
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeFolderPicker()">
    <div class="mdl">
      <div class="mdlt">guardar en carpeta</div>
      ${myFolders.length===0
        ? `<div class="empty"><div class="ei">📂</div><div class="el">Aún no tienes carpetas. Crea una desde colecciones.</div></div>`
        : myFolders.map(f => {
            const active = post && post.folder_id===f.id;
            return `<button class="folder-pick-btn${active?' active':''}" onclick="assignToFolder(${S.folderPostModal},'${f.id}')">
              <span class="fp-icon">${active?'📂':'📁'}</span>
              <span>${esc(f.name)}</span>
              ${active?'<span class="fp-check">✓</span>':''}
            </button>`;
          }).join('')}
      <div class="macts"><button class="cancelbtn" onclick="closeFolderPicker()">cancelar</button></div>
    </div>
  </div>`;
}

function renderFolderFormModal() {
  let el = document.getElementById('folderFormModal');
  if (!el) { el = document.createElement('div'); el.id='folderFormModal'; document.body.appendChild(el); }
  if (!S.folderModal) { el.innerHTML=''; return; }
  const isRename = S.folderModal==='rename';
  const folder = isRename ? S.folders.find(f=>f.id===S.folderTarget) : null;
  const val = folder ? esc(folder.name) : '';
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeFolderForm()">
    <div class="mdl">
      <div class="mdlt">${isRename?'renombrar carpeta':'nueva carpeta'}</div>
      <div class="field">
        <label>nombre de la carpeta</label>
        <input id="folderNameInput" value="${val}" placeholder="ej. poemas, usernames bonitos..." maxlength="40"/>
      </div>
      <div class="macts">
        <button class="cancelbtn" onclick="closeFolderForm()">cancelar</button>
        <button class="savebtn" onclick="${isRename?`renameFolder('${S.folderTarget}',document.getElementById('folderNameInput').value)`:`createFolder(document.getElementById('folderNameInput').value)`}">guardar</button>
      </div>
    </div>
  </div>`;
  setTimeout(()=>{ const inp=document.getElementById('folderNameInput'); if(inp){inp.focus();inp.select();} }, 30);
}

// --- MODAL EDICION DE POST ---
function openEditPost(id) {
  id = isNaN(id)?id:Number(id);
  S.editModal = id; S.menu = null; render();
}

function closeEditPost() { S.editModal = null; render(); }

function renderEditModal() {
  let el = document.getElementById('editPostModal');
  if (!el) { el = document.createElement('div'); el.id='editPostModal'; document.body.appendChild(el); }
  if (!S.editModal) { el.innerHTML=''; return; }
  const p = findPost(S.editModal);
  if (!p) { el.innerHTML=''; return; }
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeEditPost()">
    <div class="mdl">
      <div class="mdlt">editar publicación</div>
      <div class="field">
        <label>categoría</label>
        <select class="csel" id="edit-cat" style="width:100%;padding:.55rem .75rem">${CATS.slice(1).map(c=>`<option${p.category===c?' selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Contenido</label>
        <textarea id="edit-body" maxlength="${MAX_CHARS}" style="min-height:100px;width:100%;padding:.7rem .95rem;border:1px solid var(--bd);border-radius:var(--r2);background:var(--bg);color:var(--tx);font-size:.88rem;resize:none;outline:none;font-family:var(--fb)">${esc(p.body)}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:.25rem"><span id="edit-char-count" class="char-count">${MAX_CHARS-(p.body||'').length}</span></div>
      </div>
      <div class="macts">
        <button class="cancelbtn" onclick="closeEditPost()">cancelar</button>
        <button class="savebtn" onclick="saveEditPost(${S.editModal})">guardar cambios</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => {
    const ta = document.getElementById('edit-body');
    if (ta) {
      ta.focus();
      ta.addEventListener('input', () => {
        const cnt = document.getElementById('edit-char-count');
        if (cnt) { const r=MAX_CHARS-ta.value.length; cnt.textContent=r; cnt.className='char-count'+(r<50?' warn':'')+(r<0?' over':''); }
      });
    }
  }, 30);
}

async function saveEditPost(id) {
  id = isNaN(id)?id:Number(id);
  const body = document.getElementById('edit-body')?.value?.trim();
  const category = document.getElementById('edit-cat')?.value;
  if (!body) return toast('el contenido no puede estar vacío');
  if (body.length > MAX_CHARS) return toast('máximo '+MAX_CHARS+' caracteres');
  const { error } = await db.from('posts').update({ body, category }).eq('id', id);
  if (error) return toast('Error al guardar');
  const p = findPost(id);
  if (p) { p.body = body; p.category = category; }
  S.editModal = null; toast('publicación editada'); render();
}

// --- FEED ---
function rCommunitySection() {
  const postsHtml = S.communityPosts.length === 0
    ? '<div class="empty"><div class="ei">💬</div><div class="el">aún no hay publicaciones en comunidad — ¡sé el primero!</div></div>'
    : S.communityPosts.map(rpost).join('');
  return '<div class="community-tab-inline">' +
    '<div class="compose">' +
      '<div class="compose-head">' + avEl(S.me) + '<textarea id="ct-comm" class="ct" placeholder="inicia una conversación, haz una búsqueda..." maxlength="' + MAX_CHARS + '" oninput="this.style.height=\'\';this.style.height=this.scrollHeight+\'px\'"></textarea></div>' +
      '<div class="compose-foot">' +
        '<span class="char-count" id="cc-comm">0/' + MAX_CHARS + '</span>' +
        '<button class="pbtn" onclick="postCommunity()">publicar</button>' +
      '</div>' +
    '</div>' +
    postsHtml +
  '</div>';
}

function rfeed() {
  const posts = S.cat==='todos' ? [...S.posts] : S.posts.filter(p=>p.category===S.cat);
  const composeCat = S.composeCat || CATS[1]; // default primera categoría
  const isComunidad = S.feedTab === 'comunidad';
  const catsAndPosts = isComunidad ? '' : (
    '<div class="cats">' + CATS.map(c=>'<button class="catb' + (S.cat===c?' on':'') + '" onclick="setcat(\'' + c + '\')">' + c + '</button>').join('') + '</div>' +
    (posts.length===0
      ? '<div class="empty"><div class="ei">🌸</div><div class="el">todavía no hay publicaciones aquí — sé el primero ✦</div></div>'
      : posts.map(rpost).join('') + '<div id="scroll-sentinel" style="height:1px;margin:1rem 0"></div>')
  );
  return `
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, símbolos y más</div>
  <div class="ccard">
    <div class="ctop">${avEl(S.me)}<textarea class="ctxt" id="ct" placeholder="comparte algo bonito..." maxlength="${MAX_CHARS}"></textarea></div>
    <div style="display:flex;justify-content:flex-end;padding:.2rem 0 0">
      <span id="char-count" class="char-count">${MAX_CHARS}</span>
    </div>
    <div class="compose-cats">
      ${CATS.slice(1).map(c=>`<button class="compose-catb${composeCat===c?' on':''}" onclick="setComposeCat('${c}')">${c}</button>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:.65rem">
      <button class="pbtn" onclick="post()">publicar</button>
    </div>
  </div>
  <div class="explore-banner" onclick="goExplore()">
    <div class="explore-banner-icon">
      <i class="fi fi-rr-star"></i>
    </div>
    <div class="explore-banner-text">
      <div class="explore-banner-title">explorar destacados</div>
      <div class="explore-banner-sub">publicaciones populares de las últimas 48 horas</div>
    </div>
    <div class="explore-banner-arrow"><i class="fi fi-rr-angle-right"></i></div>
  </div>
  <div class="feed-tabs">
    <button class="feed-tab${S.feedTab!=='siguiendo'&&S.feedTab!=='explorar'&&S.feedTab!=='comunidad'?' on':''}" onclick="setFeedTab('todos')">✦ todos</button>
    <button class="feed-tab${S.feedTab==='comunidad'?' on':''}" onclick="setFeedTab('comunidad')">comunidad</button>
    <button class="feed-tab${S.feedTab==='siguiendo'?' on':''}" onclick="setFeedTab('siguiendo')">siguiendo</button>
  </div>
  ${isComunidad ? rCommunitySection() : catsAndPosts}
  `;
}

function rpost(p) {
  const likes = Array.isArray(p.likes)?p.likes:[];
  const saved  = Array.isArray(p.saved)?p.saved:[];
  const cmts   = Array.isArray(p.cmts)?p.cmts:[];
  // Si es nuestro propio post, leer siempre el nombre actual de S.me para reflejar cambios sin recargar
  // Para posts propios: usar datos frescos de S.me (avatar siempre actualizado)
  // Para posts ajenos: preferir S.users (tiene URLs frescas de vprof) antes que author_av de DB (puede expirar)
  const _cachedAuthor = p.user_id !== S.me.id ? S.users.find(x=>x.id===p.user_id) : null;
  const author = p.user_id === S.me.id
    ? { name: S.me.user_metadata?.display_name||S.me.email, username: S.me.user_metadata?.display_name||S.me.email, avatar_url: S.me.user_metadata?.avatar_url||null }
    : (_cachedAuthor
        ? { name: _cachedAuthor.display_name||_cachedAuthor.username, username: _cachedAuthor.display_name||_cachedAuthor.username, avatar_url: _cachedAuthor.avatar_url||p.author_av||null }
        : { name:p.username||'Usuario', username:p.username||'Usuario', avatar_url:p.author_av||null });
  const liked = likes.includes(S.me.id);
  const isSaved = saved.includes(S.me.id);
  const own = p.user_id===S.me.id;
  const mopen = S.menu===p.id;
  const copen = S.coOpen[p.id];
  const cid = safeId(p.id);

  return `
  <div class="pcard" id="post-${cid}">
    <div class="phead">
      ${avEl(author)}
      <div style="flex:1">
        <div class="puname" onclick="vprof('${p.user_id}')" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' ')vprof('${p.user_id}')">${esc(author.username)}</div>
        <div class="ptime" data-ts="${p.created_at}">${ago(p.created_at)}</div>
      </div>
      <span class="pbadge">${esc(p.category)}</span>
      ${own?`<div class="mwrap">
        <button class="dotsbtn${mopen?' open':''}" onclick="tmenu('${p.id}',event)">...</button>
      </div>`:''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn like-btn${liked?' liked':''}" onclick="tlike('${p.id}')"><i class="${liked?'fi fi-sr-heart':'fi fi-rr-heart'}"></i> ${likes.length}</button>
      <button class="abtn comment-btn${copen?' active':''}" onclick="tcmt('${p.id}')"><i class="${copen?'fi fi-sr-comment':'fi fi-rr-comment'}"></i> ${cmts.length}</button>
      <button class="abtn save-btn${isSaved?' sav':''}" onclick="tsave('${p.id}')"><i class="${isSaved?'fi fi-sr-bookmark':'fi fi-rr-bookmark'}"></i> ${isSaved?'guardado':'guardar'}</button>
      <button class="abtn copy-btn" onclick="copyPost('${p.id}')" title="copiar texto"><i class="fi fi-rr-copy"></i> copiar</button>
      <button class="abtn share-btn" onclick="sharePost('${p.id}',event)" title="compartir"><i class="fi fi-rr-share"></i><span class="share-label"> compartir</span></button>
    </div>
    ${copen?`<div class="csec">
      <div class="crow" id="crow-${cid}">
        <div class="cinput-wrap">
          <div class="reply-indicator" id="reply-ind-${cid}" style="display:none"></div>
          <input class="cinput" id="${cid}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${p.id}');if(event.key==='Escape')cancelReply('${p.id}')"/>
        </div>
        <button class="sendbtn" onclick="scmt('${p.id}')">↑</button>
      </div>
      ${cmts.map((c,ci)=>renderComment(c, p.id, cid)).join('')}
    </div>`:''}
  </div>`;
}

// --- HELPER: RENDERIZAR UN COMENTARIO (con soporte de respuestas) ---
function renderComment(c, postId, cid) {
  const isReply = !!c.replyTo;
  const replyLabel = isReply ? `<span class="cmt-reply-to">↳ ${esc(c.replyToName||'')}</span>` : '';
  const likedCmt = Array.isArray(c.likes) && c.likes.includes(S.me.id);
  return `<div class="cm${isReply?' cm-reply':''}" id="cmt-${c.id}">
    <div onclick="vprof('${c.uid}')" style="cursor:pointer" title="ver perfil">${avEl({name:c.un,username:c.un,avatar_url:c.av||null})}</div>
    <div class="cmb">
      <div class="cma">
        <span>${esc(c.un)}</span>
        ${replyLabel}
        <span class="cmt-time" data-ts="${c.t}">${ago(c.t)}</span>
        <button class="cmt-like-btn${likedCmt?' liked':''}" data-cmt-like="${c.id}" onclick="tlikeCmt('${postId}','${c.id}')"><i class="${likedCmt?'fi fi-sr-heart':'fi fi-rr-heart'}"></i><span class="cmt-like-count">${c.likes&&c.likes.length>0?c.likes.length:''}</span></button>
        <button class="cmt-reply-btn" onclick="startReply('${postId}','${c.id}','${c.un.replace(/'/g,"\\'")}',event)" title="responder">↩ responder</button>
        ${c.uid === S.me.id ? `<button class="cmt-del" onclick="dcmt('${postId}', '${c.id}')" title="eliminar comentario">✕</button>` : ''}
      </div>
      <div class="cmt">${esc(c.txt)}</div>
    </div>
  </div>`;
}

// --- RESPONDER COMENTARIO ---
function startReply(postId, cmtId, cmtUsername, e) {
  if (e) e.stopPropagation();
  postId = isNaN(postId)?postId:Number(postId);
  const cid = safeId(postId);
  S.replyTo[postId] = { cmtId, un: cmtUsername };
  // Mostrar indicador de respuesta
  const ind = document.getElementById(`reply-ind-${cid}`);
  if (ind) {
    ind.style.display = 'flex';
    ind.innerHTML = `<span>↩ respondiendo a <b>${esc(cmtUsername)}</b></span><button class="reply-cancel-btn" onclick="cancelReply('${postId}')">✕</button>`;
  }
  // Actualizar placeholder del input
  const inp = document.getElementById(cid);
  if (inp) {
    inp.placeholder = `responder a ${cmtUsername}...`;
    inp.focus();
  }
}

function cancelReply(postId) {
  postId = isNaN(postId)?postId:Number(postId);
  const cid = safeId(postId);
  delete S.replyTo[postId];
  const ind = document.getElementById(`reply-ind-${cid}`);
  if (ind) ind.style.display = 'none';
  const inp = document.getElementById(cid);
  if (inp) inp.placeholder = 'escribe un comentario...';
}

// --- COMPARTIR POST ---
function sharePost(id, e) {
  if (e) e.stopPropagation();
  id = isNaN(id)?id:Number(id);
  // Construir URL del post
  const base = window.location.origin;
  const url = `${base}/post.html?id=${id}`;
  // Menú de opciones de compartir
  showShareMenu(id, url, e);
}

function showShareMenu(postId, url, e) {
  // Eliminar menú previo si existe
  const prev = document.getElementById('shareMenuPortal');
  if (prev) prev.remove();

  const btn = e?.currentTarget || e?.target;
  const rect = btn ? btn.getBoundingClientRect() : { bottom: 100, right: 100 };
  const menuTop = rect.bottom + 6;
  const menuRight = window.innerWidth - rect.right;

  const el = document.createElement('div');
  el.id = 'shareMenuPortal';
  el.innerHTML = `<div class="pmenu share-menu" style="position:fixed;top:${menuTop}px;right:${menuRight}px;z-index:9999;min-width:200px">
    <div class="share-menu-title">compartir publicación</div>
    <button class="mi" onclick="copyPostLink('${postId}','${encodeURIComponent(url)}')"><i class="fi fi-rr-link"></i> copiar enlace</button>
    ${navigator.share ? `<button class="mi" onclick="nativeShare('${postId}','${encodeURIComponent(url)}')"><i class="fi fi-rr-share"></i> compartir...</button>` : ''}
  </div>`;
  document.body.appendChild(el);

  // Cerrar al click fuera
  setTimeout(() => {
    const closeHandler = (ev) => {
      if (!ev.target.closest('#shareMenuPortal') && !ev.target.closest('.share-btn')) {
        el.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 10);
}

function copyPostLink(postId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  const el = document.getElementById('shareMenuPortal');
  if (el) el.remove();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('enlace copiado ✦')).catch(() => fallbackCopy(url));
  } else { fallbackCopy(url); }
}

function nativeShare(postId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  postId = isNaN(postId)?postId:Number(postId);
  const el = document.getElementById('shareMenuPortal');
  if (el) el.remove();
  const p = findPost(postId);
  if (navigator.share) {
    navigator.share({
      title: 'sigilo',
      text: p ? p.body.slice(0, 80) + (p.body.length > 80 ? '...' : '') : 'publicación en sigilo',
      url,
    }).catch(() => {});
  }
}

// PERFIL
function rprofile() {
  // Guardia: si puid es null (race condition con fetchFolders u otro render async),
  // no renderizar perfil — mostrar loading hasta que puid esté disponible
  if (!S.puid) {
    return '<div class="ppage"><div style="text-align:center;padding:3rem;opacity:.4">cargando perfil...</div></div>';
  }
  const own = S.puid === S.me.id;

  let user;
  if (own) {
    user = S.me;
  } else {
    // S.users se actualiza con datos frescos en vprof(); usar fallback del post mientras carga
    const cached = S.users.find(x => x.id === S.puid);
    const authorData = S.posts.find(p => p.user_id === S.puid);
    user = cached || {
      id: S.puid,
      username: authorData?.username || 'Usuario',
      display_name: authorData?.username || 'Usuario',
      avatar_url: authorData?.author_av || null,
      bio: undefined  // undefined = aún no cargó; '' = usuario sin bio
    };
  }

  // Resolución robusta de nombre y bio (distintos campos según si es propio o ajeno)
  const displayName = own
    ? esc(S.me.user_metadata?.display_name || S.me.name || S.me.email || 'Usuario')
    : esc(user.display_name || user.username || user.name || 'Usuario');
  // Para perfil propio: auth metadata > _profileBio (cargado desde profiles al abrir modal) > ''
  // Para perfil ajeno: S.users cache (cargado en vprof) > ''
  const bioRaw = own
    ? (S.me.user_metadata?.bio || S._profileBio || '')
    : (user.bio || '');
  // Solo mostrar "cargando..." si es perfil ajeno Y user.bio es undefined (aún no llegaron datos del fetch)
  // Si bio es '' (cadena vacía), el usuario simplemente no escribió bio — mostrar "sin biografía aún"
  const bioLoading = !own && (user.bio === undefined);
  const bioDisplay = bioLoading
    ? '<span style="color:var(--tx3);font-style:italic;font-size:.8rem">cargando...</span>'
    : esc(bioRaw || 'sin biografía aún').replace(/\n/g, '<br/>');

  const tab = S.ptab;
  const myp = S.posts.filter(p => p.user_id === S.puid);
  const svd = S.posts.filter(p => Array.isArray(p.saved) && p.saved.includes(S.me.id));
  const col = S.posts.filter(p => p.user_id === S.puid && p.col);
  const userFolders = S.folders.filter(f => f.user_id === S.puid);

  return `
  <div class="ppage">
    <div class="pavwrap">
      <div class="pav" ${own ? 'onclick="upavatar()"' : ''} style="${own ? 'cursor:pointer' : 'cursor:default'}">
        ${avEl(user, true, own)} 
      </div>
    </div>
    <input type="file" id="avup" accept="image/*" style="display:none" onchange="havatar(event)"/>
    <div class="pinfo">
      <div class="pname">${displayName}</div>
      <div class="pbio">${bioDisplay}</div>
      ${own ? `<button class="editbtn" onclick="openmod()">editar perfil</button>` : ''}
    </div>
    <div class="ptabs">
      <button class="ptab${tab === 'posts' ? ' on' : ''}" onclick="stptab('posts')">publicaciones</button>
      <button class="ptab${tab === 'col' ? ' on' : ''}" onclick="stptab('col')">colecciones</button>
      ${own ? `<button class="ptab${tab === 'saved' ? ' on' : ''}" onclick="stptab('saved')">guardados</button>` : ''}
    </div>
    ${tab === 'posts' ? renderProfilePosts(myp, S.puid) : ''}
    ${tab === 'saved' ? (svd.length ? svd.map(rpost).join('') : `<div class="empty"><div class="el">aún no guardaste nada</div></div>`) : ''}
    ${tab === 'col' ? renderCollections(userFolders, col, own) : ''}
  </div>
  ${S.modal ? `<div class="mov profile-edit-modal" onclick="mclose(event)">
    <div class="mdl">
      <div class="mdlt">editar perfil</div>
      <div class="field"><label>Nombre</label><input id="en" value="${esc(S.me.user_metadata?.display_name || S.me.name || '')}"/></div>
      <div class="field"><label>Biografía</label><textarea id="eb" rows="3" placeholder="cuéntanos de ti..." style="resize:vertical;min-height:72px">${esc(S.me.user_metadata?.bio ?? S._profileBio ?? '')}</textarea></div>
      <div class="macts">
        <button class="cancelbtn" onclick="closemod()">cancelar</button>
        <button class="savebtn profile-save-btn" onclick="savemod()">guardar</button>
      </div>
    </div>
  </div>` : ''}`;
}

function renderProfilePosts(myp, profileUid) {
  const pinnedId = S.pinnedPosts[profileUid];
  const pinned = pinnedId ? myp.find(p => p.id === pinnedId) : null;
  const rest = pinned ? myp.filter(p => p.id !== pinnedId) : myp;
  if (myp.length === 0) return `<div class="empty"><div class="el">aún no hay publicaciones</div></div>`;
  let html = '';
  if (pinned) {
    html += `<div class="pinned-section">
      <div class="pin-indicator"><i class="fi fi-sr-thumbtack"></i> anclado</div>
      ${rpost(pinned)}
    </div>`;
  }
  html += rest.map(rpost).join('');
  return html;
}

function renderCollections(userFolders, col, own) {
  const uncategorized = col.filter(p => !p.folder_id || !userFolders.find(f=>f.id===p.folder_id));
  let html = '';
  if (own) html += `<div class="folder-toolbar"><button class="folder-new-btn" onclick="openCreateFolder()">+ nueva carpeta</button></div>`;
  if (col.length===0 && userFolders.length===0) {
    return html + `<div class="empty"><div class="ei">📂</div><div class="el">${own?'usa el menú ··· de tus publicaciones para guardar en colecciónes':'este usuario no tiene colecciones aún'}</div></div>`;
  }
  if (userFolders.length > 0) {
    html += `<div class="folders-grid">`;
    for (const f of userFolders) {
      const fPosts = col.filter(p=>p.folder_id===f.id);
      const isActive = S.activeFolderTab===f.id;
      html += `<div class="folder-card${isActive?' open':''}">
        <div class="folder-card-head" onclick="toggleFolderView('${f.id}')">
          <span class="folder-icon">📁</span>
          <span class="folder-name">${esc(f.name)}</span>
          <span class="folder-count">${fPosts.length}</span>
          ${own?`<div class="folder-actions" onclick="event.stopPropagation()">
            <button class="folder-act-btn" onclick="openRenameFolder('${f.id}')" title="renombrar">✎</button>
            <button class="folder-act-btn del" onclick="confirmAction('¿Eliminar la carpeta?',()=>deleteFolder('${f.id}'))" title="eliminar">✕</button>
          </div>`:''}
          <span class="folder-chevron">${isActive?'▲':'▼'}</span>
        </div>
        ${isActive?`<div class="folder-posts">
          ${fPosts.length===0?`<div class="empty"><div class="el">esta carpeta está vacía</div></div>`:fPosts.map(rpost).join('')}
        </div>`:''}
      </div>`;
    }
    html += `</div>`;
  }
  if (uncategorized.length > 0) {
    html += `<div class="folder-section-label">sin carpeta</div>` + uncategorized.map(rpost).join('');
  }
  return html;
}

// --- ACCIONES ---
function setcat(c) { S.cat=c; S.menu=null; render(); }
function setFeedTab(tab) {
  if (tab === 'explorar') { goExplore(); return; }
  S.feedTab = tab;
  S.menu = null;
  if (tab === 'comunidad') {
    render();
    // Fetch community posts if not loaded yet
    if (S.communityPosts.length === 0) {
      fetchCommunityPosts().then(() => {
        if (S.feedTab === 'comunidad') render();
        setTimeout(() => {
          const ta = document.getElementById('ct-comm');
          const cc = document.getElementById('cc-comm');
          if (ta && cc) ta.addEventListener('input', () => { cc.textContent = ta.value.length + '/' + MAX_CHARS; });
        }, 50);
      });
    } else {
      setTimeout(() => {
        const ta = document.getElementById('ct-comm');
        const cc = document.getElementById('cc-comm');
        if (ta && cc) ta.addEventListener('input', () => { cc.textContent = ta.value.length + '/' + MAX_CHARS; });
      }, 50);
    }
    return;
  }
  render();
}
window.setFeedTab = setFeedTab;
function setComposeCat(c) {
  S.composeCat = c;
  // Actualizar solo las pills sin re-render completo (evita flash del textarea)
  document.querySelectorAll('.compose-catb').forEach(btn => {
    btn.classList.toggle('on', btn.textContent.trim() === c);
  });
}
function stptab(t) { S.ptab=t; S.activeFolderTab=null; render(); window.scrollTo({top:0,behavior:"smooth"}); }
function tmenu(id,e) {
  e.stopPropagation();
  id=isNaN(id)?id:Number(id);
  if (S.menu===id) { S.menu=null; renderPostMenu(); return; }
  S.menu=id;
  // Capturar posición del botón para el menú flotante
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  S.menuPos = { top: rect.bottom + 6, right: window.innerWidth - rect.right };
  renderPostMenu();
}

function renderPostMenu() {
  let el = document.getElementById('postMenuPortal');
  if (!el) { el = document.createElement('div'); el.id='postMenuPortal'; document.body.appendChild(el); }
  if (!S.menu || !S.menuPos) { el.innerHTML=''; return; }
  const p = findPost(S.menu);
  if (!p) { el.innerHTML=''; return; }
  const { top, right } = S.menuPos;
  el.innerHTML = `<div class="pmenu" style="position:fixed;top:${top}px;right:${right}px;z-index:9999;min-width:170px">
    <button class="mi" onclick="openEditPost('${p.id}')"><i class="fi fi-rr-edit"></i> editar</button>
    <button class="mi${S.pinnedPosts[S.me.id]===p.id?' pin-active':''}" onclick="pinPost('${p.id}')"><i class="${S.pinnedPosts[S.me.id]===p.id?'fi fi-sr-thumbtack':'fi fi-rr-thumbtack'}"></i> ${S.pinnedPosts[S.me.id]===p.id?'desanclar':'anclar en perfil'}</button>
    <button class="mi" onclick="tocol('${p.id}')"><i class="fi fi-rr-apps"></i> ${p.col?'quitar de colección':'guardar en colección'}</button>
    ${p.col?`<button class="mi" onclick="openFolderPicker('${p.id}')"><i class="fi fi-rr-folder"></i> ${p.folder_id?'mover de carpeta':'poner en carpeta'}</button>`:''}
    <button class="mi del" onclick="confirmAction('¿Eliminar esta publicación? No se puede deshacer.',()=>dpost(${p.id}))"><i class="fi fi-rr-trash"></i> eliminar</button>
  </div>`;
}

document.addEventListener('click', e => {
  if (S.menu && !e.target.closest('.mwrap') && !e.target.closest('#postMenuPortal')) { S.menu=null; renderPostMenu(); }
  if (S.searchOpen && !e.target.closest('#searchOverlay') && !e.target.closest('#ns')) toggleSearch();
  // Fix móvil: excluir también #mob-notif para que el tap no abra+cierre al mismo tiempo
  if (S.notifOpen && !e.target.closest('#notifPanel') && !e.target.closest('#notif-btn') && !e.target.closest('#mob-notif')) {
    S.notifOpen=false; renderNotifPanel();
  }
});

// Cerrar el menú flotante al hacer scroll
window.addEventListener('scroll', () => {
  if (S.menu) { S.menu=null; renderPostMenu(); }
}, { passive: true });

async function post() {
  const txt = document.getElementById('ct').value.trim();
  const cat = S.composeCat || CATS[1];
  if (!txt) return toast('escribe algo primero');
  if (txt.length > MAX_CHARS) return toast('máximo '+MAX_CHARS+' caracteres');
  const btn = document.querySelector('.pbtn');
  if (btn) { btn.textContent='publicando...'; btn.disabled=true; }
  const { data, error } = await db.from('posts').insert([{ body:txt, category:cat, user_id:S.me.id, username:S.me.user_metadata?.display_name||S.me.email, author_av:S.me.user_metadata?.avatar_url||null }]).select();
  if (btn) { btn.textContent='publicar'; btn.disabled=false; }
  if (error) toast('Error: '+error.message);
  else {
    const ctEl = document.getElementById('ct');
    if (ctEl) { ctEl.value=''; ctEl.style.height=''; ctEl.style.minHeight=''; }
    // Añadir nuevo post al inicio con animación
    if (data && data[0]) {
      const np = { ...data[0], likes: [], cmts: [], saved: [], t: data[0].created_at };
      S.posts.unshift(np);
    }
    render();
    // Marcar el primer post como nuevo para la animación
    setTimeout(() => {
      const first = document.querySelector('.pcard');
      if (first) { first.classList.add('new-post'); setTimeout(()=>first.classList.remove('new-post'), 400); }
      setupInfiniteScroll();
    }, 30);
    toast('publicado');
  }
}

function copyPost(id) {
  id = isNaN(id)?id:Number(id);
  const p = findPost(id); if(!p) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(p.body).then(()=>toast('copiado al portapapeles')).catch(()=>fallbackCopy(p.body));
  } else { fallbackCopy(p.body); }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText='position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); toast('copiado al portapapeles'); } catch(e) { toast('no se pudo copiar'); }
  document.body.removeChild(ta);
}

// Helper: busca un post en S.posts O en S.communityPosts
function findPost(id) {
  return findPost(id) || S.communityPosts.find(x=>x.id===id) || null;
}
window.findPost = findPost;

async function tlike(id) {
  id=isNaN(id)?id:Number(id);
  const p=findPost(id); if(!p) return;
  if(!Array.isArray(p.likes)) p.likes=[];
  const i=p.likes.indexOf(S.me.id);
  const wasLiked = i>-1;
  if(wasLiked) p.likes.splice(i,1); else p.likes.push(S.me.id);
  // Patch solo el botón de like sin re-render completo
  const cid = safeId(id);
  const btn = document.querySelector(`#post-${cid} .abtn.liked, #post-${cid} .abtn:first-child`);
  const likeBtn = document.querySelector(`#post-${cid} .pacts .like-btn`);
  if (likeBtn) {
    const isNowLiked = p.likes.includes(S.me.id);
    const icon = likeBtn.querySelector('i');
    if (icon) icon.className = isNowLiked ? 'fi fi-sr-heart' : 'fi fi-rr-heart';
    likeBtn.childNodes[likeBtn.childNodes.length - 1].textContent = ' ' + p.likes.length;
    likeBtn.className = `abtn like-btn${isNowLiked ? ' liked' : ''}`;
    // Animación pop al dar like
    if (isNowLiked) {
      likeBtn.classList.add('pop');
      setTimeout(() => likeBtn.classList.remove('pop'), 260);
    }
  }
  const {error}=await db.from('posts').update({likes:p.likes}).eq('id',id);
  if(error) { toast('Error al dar like'); render(); }
  else if (!wasLiked && p.user_id !== S.me.id) {
    const myName = S.me.user_metadata?.display_name||S.me.email;
    saveNotif(p.user_id, 'like', myName, id, p.body);
  }
}

async function tsave(id) {
  id=isNaN(id)?id:Number(id);
  const p=findPost(id); if(!p) return;
  if(!Array.isArray(p.saved)) p.saved=[];
  const i=p.saved.indexOf(S.me.id);
  if(i>-1){p.saved.splice(i,1);}else{p.saved.push(S.me.id);}
  // Patch solo el botón de guardar sin re-render completo
  const cid = safeId(id);
  const saveBtn = document.querySelector(`#post-${cid} .save-btn`);
  if (saveBtn) {
    const isSaved = p.saved.includes(S.me.id);
    const icon = saveBtn.querySelector('i');
    if (icon) icon.className = isSaved ? 'fi fi-sr-bookmark' : 'fi fi-rr-bookmark';
    const textNodes = [...saveBtn.childNodes].filter(n => n.nodeType === 3);
    if (textNodes.length) textNodes[textNodes.length-1].textContent = ` ${isSaved ? 'guardado' : 'guardar'}`;
    saveBtn.className = `abtn save-btn${isSaved ? ' sav' : ''}`;
    if (isSaved && icon) {
      icon.classList.add('pop');
      setTimeout(() => icon.classList.remove('pop'), 260);
    }
  }
  toast(p.saved.includes(S.me.id) ? 'guardado' : 'eliminado de guardados');
  const {error}=await db.from('posts').update({saved:p.saved}).eq('id',id);
  if(error) { toast('Error al guardar'); render(); }
}

async function tocol(id) {
  id=isNaN(id)?id:Number(id);
  const p=findPost(id); if(!p) return;
  p.col=!p.col; if(!p.col) p.folder_id=null;
  // Cerrar menú sin re-render completo
  S.menu=null;
  const cid = safeId(id);
  const card = document.getElementById('post-' + cid);
  if (card) { const menu = card.querySelector('.pmenu'); if (menu) menu.remove(); }
  const {error}=await db.from('posts').update({col:p.col,folder_id:p.folder_id||null}).eq('id',id);
  if(error) toast('Error al actualizar colección');
  else { toast(p.col?'añadido a colección':'eliminado de colección'); }
}

async function dpost(id) {
  id=isNaN(id)?id:Number(id);
  const {error}=await db.from('posts').delete().eq('id',id);
  if(error) toast('Error al eliminar');
  else { S.posts=S.posts.filter(x=>x.id!==id); S.communityPosts=S.communityPosts.filter(x=>x.id!==id); S.menu=null; toast('publicación eliminada'); render(); }
}

function tcmt(id) {
  id=isNaN(id)?id:Number(id);
  S.coOpen[id]=!S.coOpen[id];
  const cid = safeId(id);
  const card = document.getElementById(`post-${cid}`);
  if (!card) { render(); return; }
  const p = findPost(id);
  if (!p) { render(); return; }
  // Update comment button icon and class
  const cmtBtn = card.querySelector('.pacts .comment-btn');
  if (cmtBtn) {
    const isOpen = S.coOpen[id];
    const icon = cmtBtn.querySelector('i');
    if (icon) icon.className = isOpen ? 'fi fi-sr-comment' : 'fi fi-rr-comment';
    cmtBtn.className = `abtn comment-btn${isOpen ? ' active' : ''}`;
    if (isOpen && icon) {
      icon.classList.add('pop');
      setTimeout(() => icon.classList.remove('pop'), 260);
    }
  }
  // Patch solo la sección de comentarios del post específico
  let csec = card.querySelector('.csec');
  if (!S.coOpen[id]) {
    if (csec) csec.remove();
    return;
  }
  if (!csec) {
    csec = document.createElement('div');
    csec.className = 'csec';
    card.appendChild(csec);
  }
  const cmts = Array.isArray(p.cmts) ? p.cmts : [];
  const replyState = S.replyTo[id];
  csec.innerHTML = `
    <div class="crow" id="crow-${cid}">
      <div class="cinput-wrap">
        <div class="reply-indicator" id="reply-ind-${cid}" style="${replyState ? 'display:flex' : 'display:none'}">
          ${replyState ? `<span>↩ respondiendo a <b>${esc(replyState.un)}</b></span><button class="reply-cancel-btn" onclick="cancelReply('${id}')">✕</button>` : ''}
        </div>
        <input class="cinput" id="${cid}" placeholder="${replyState ? `responder a ${replyState.un}...` : 'escribe un comentario...'}" onkeydown="if(event.key==='Enter')scmt('${id}');if(event.key==='Escape')cancelReply('${id}')"/>
      </div>
      <button class="sendbtn" onclick="scmt('${id}')">↑</button>
    </div>
    ${cmts.map((c)=>renderComment(c, id, cid)).join('')}`;
  setTimeout(() => document.getElementById(cid)?.focus(), 30);
}

async function scmt(id) {
  id = isNaN(id) ? id : Number(id);
  const inp = document.getElementById(safeId(id)); 
  if (!inp) return;
  const txt = inp.value.trim(); 
  if (!txt) return;

  const p = findPost(id); 
  if (!p) return;
  if (!Array.isArray(p.cmts)) p.cmts = [];

  const myName = S.me.user_metadata?.display_name || S.me.email;
  const replyState = S.replyTo[id];
  
  const nuevoComentario = {
    id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5),
    uid: S.me.id,
    un: myName,
    av: S.me.user_metadata?.avatar_url || null,
    txt,
    t: new Date().toISOString(),
    ...(replyState ? { replyTo: replyState.cmtId, replyToName: replyState.un } : {}),
  };

  p.cmts.push(nuevoComentario);

  const { error } = await db.from('posts').update({ cmts: p.cmts }).eq('id', id);

  if (error) {
    p.cmts.pop();
    toast('Error al comentar');
  } else {
    inp.value = '';
    // Limpiar estado de respuesta
    cancelReply(id);
    if (p.user_id !== S.me.id) {
      const myName2 = S.me.user_metadata?.display_name||S.me.email;
      saveNotif(p.user_id, 'comment', myName2, id, p.body);
    }
    // Patch solo la sección de comentarios sin re-render completo
    const cid = safeId(id);
    const card = document.getElementById(`post-${cid}`);
    const csec = card?.querySelector('.csec');
    if (csec) {
      // Añadir el nuevo comentario al DOM usando renderComment
      const cmDiv = document.createElement('div');
      cmDiv.outerHTML; // just to force parse
      const tmp = document.createElement('template');
      tmp.innerHTML = renderComment(nuevoComentario, id, cid);
      const newNode = tmp.content.firstElementChild;
      csec.appendChild(newNode);
      // Update comment count
      const cmtBtn = card?.querySelector('.pacts .comment-btn');
      if (cmtBtn) cmtBtn.innerHTML = `<i class="fi fi-rr-comment"></i> ${p.cmts.length}`;
    }
  }
}

async function dcmt(postId, cmtId) {
  postId = isNaN(postId) ? postId : Number(postId);
  const p = findPost(postId); 
  if (!p || !Array.isArray(p.cmts)) return;

  const nuevosComentarios = p.cmts.filter(c => c.id !== cmtId);

  const { error } = await db.from('posts').update({ cmts: nuevosComentarios }).eq('id', postId);

  if (error) {
    toast('Error al eliminar comentario');
  } else {
    p.cmts = nuevosComentarios;
    toast('comentario eliminado');
    // Patch solo el comentario específico sin re-render completo
    const cid = safeId(postId);
    const card = document.getElementById(`post-${cid}`);
    const csec = card?.querySelector('.csec');
    if (csec) {
      // Rebuildear la sección de comentarios (es la más simple y segura)
      const cmtBtn = card?.querySelector('.pacts .comment-btn');
      if (cmtBtn) cmtBtn.innerHTML = `<i class="fi fi-rr-comment"></i> ${nuevosComentarios.length}`;
      const cmDivs = csec.querySelectorAll('.cm');
      // Encontrar y eliminar el div del comentario que contiene el botón pulsado
      cmDivs.forEach(div => {
        const delBtn = div.querySelector('.cmt-del');
        if (delBtn && delBtn.getAttribute('onclick')?.includes(cmtId)) {
          div.remove();
        }
      });
    }
  }
}

function upavatar() { document.getElementById('avup').click(); }

// --- CACHÉ DE URLs FIRMADAS PARA AVATARES ---
// Evita re-descargar el avatar en cada visita y reduce el egress de Supabase
const _avatarCache = {}; // { userId: { url, expira } }

async function getSignedAvatarUrl(userId, path) {
  const ahora = Date.now();
  // Reutilizar URL en caché si aún es válida (55 min de margen antes de la hora)
  if (_avatarCache[userId] && _avatarCache[userId].expira > ahora) {
    return _avatarCache[userId].url;
  }
  try {
    const { data, error } = await db.storage.from('avatars').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    _avatarCache[userId] = { url: data.signedUrl, expira: ahora + 55 * 60 * 1000 };
    return data.signedUrl;
  } catch(e) { return null; }
}

async function havatar(e) {
  const f=e.target.files[0]; if(!f) return;
  toast('subiendo foto...');

  // Refrescar sesión antes de updateUser para evitar 403 Forbidden
  const { data: refreshData, error: refreshErr } = await db.auth.refreshSession();
  if (refreshErr || !refreshData?.session) { toast('Sesión expirada. Vuelve a iniciar sesión.'); return; }
  S.me = refreshData.session.user;

  // Usamos siempre el mismo nombre de archivo (sin extensión variable)
  // para que la URL sea estable y predecible entre dispositivos
  const path=`${S.me.id}/avatar`;
  const {error:upErr}=await db.storage.from('avatars').upload(path,f,{
    upsert:true,
    contentType:f.type,
    cacheControl:'31536000' // 1 año de caché en el navegador — reduce egress
  });
  if(upErr){toast('Error al subir imagen');return;}

  // Invalidar caché local para que la próxima carga use la nueva imagen
  delete _avatarCache[S.me.id];

  // Generar URL firmada (acceso autenticado — evita acceso público masivo)
  const signedUrl = await getSignedAvatarUrl(S.me.id, path);
  if (!signedUrl) { toast('Error al obtener URL del avatar'); return; }

  // Guardamos el path en Auth y BD (no la URL completa, que expira)
  // El path es suficiente para regenerar la URL firmada cuando se necesite
  const {error:authErr}=await db.auth.updateUser({data:{avatar_path:path, avatar_url:signedUrl}});
  if(authErr){toast('Error al guardar avatar');return;}

  S.me.user_metadata.avatar_url=signedUrl;
  S.me.user_metadata.avatar_path=path;
  // NO guardamos signedUrl en author_av de posts — esa URL expira en 1h y rompe avatares en el feed.
  // Los posts del propio usuario usan S.me.user_metadata.avatar_url (siempre fresco).
  // Guardar avatar_path (permanente) en profiles — cualquier visitante regenera URL desde aquí.
  try { await db.from('profiles').upsert([{ id: S.me.id, avatar_path: path }], { onConflict: 'id' }); } catch(e) {}
  // Actualizar posts locales en memoria para reflejar el cambio visualmente (solo sesión actual)
  S.posts.forEach(p=>{ if(p.user_id===S.me.id) p.author_av=signedUrl; });
  render(); toast('foto actualizada');
}

async function openmod() {
  S.modal = true;
  // Cargar bio desde profiles si auth no la tiene todavia
  // (pasa cuando el usuario se registro y la bio solo quedo en profiles)
  if (!S.me.user_metadata?.bio) {
    try {
      const { data } = await db.from('profiles')
        .select('bio')
        .eq('id', S.me.id)
        .single();
      if (data?.bio) {
        S._profileBio = data.bio;
        // Sincronizar bio con auth para futuras aperturas
        try { await db.auth.updateUser({ data: { bio: data.bio } }); } catch(e2) {}
        try {
          const { data: refreshed } = await db.auth.refreshSession();
          if (refreshed?.session?.user) S.me = refreshed.session.user;
          else S.me.user_metadata.bio = data.bio;
        } catch(e3) { S.me.user_metadata.bio = data.bio; }
      } else {
        S._profileBio = '';
      }
    } catch(e) { S._profileBio = ''; }
  } else {
    S._profileBio = S.me.user_metadata.bio;
  }
  render();
}
function closemod(){S.modal=false;render();}
function mclose(e){if(e.target===e.currentTarget)closemod();}

async function savemod() {
  const enEl = document.getElementById('en');
  const ebEl = document.getElementById('eb');
  if (!enEl || !ebEl) return;
  const n = enEl.value.trim();
  const b = ebEl.value.trim();
  if (!n) return toast('el nombre no puede estar vacío');

  // Selector específico: solo el botón guardar dentro del modal de editar perfil
  const btn = document.querySelector('.profile-edit-modal .savebtn, .profile-save-btn');
  if (btn) { btn.textContent = 'guardando...'; btn.disabled = true; }

  const oldName = S.me.user_metadata?.display_name || '';

  // 1. Guardar en Supabase Auth
  const { error } = await db.auth.updateUser({ data: { display_name: n, bio: b } });
  if (error) {
    if (btn) { btn.textContent = 'guardar'; btn.disabled = false; }
    return toast('Error al guardar perfil: ' + error.message);
  }

  // 2. Refrescar sesión para que S.me tenga los metadatos actualizados
  try {
    const { data: refreshed } = await db.auth.refreshSession();
    if (refreshed?.session?.user) S.me = refreshed.session.user;
    else {
      // Actualizar manualmente si el refresh no devuelve usuario
      S.me.user_metadata.display_name = n;
      S.me.user_metadata.bio = b;
    }
  } catch(e) {
    S.me.user_metadata.display_name = n;
    S.me.user_metadata.bio = b;
  }

  // 3. Sincronizar tabla profiles — incluir avatar_path para no borrarlo
  try {
    const avatarPath = S.me.user_metadata?.avatar_path || null;
    const upsertData = { id: S.me.id, username: n, display_name: n, bio: b };
    if (avatarPath) upsertData.avatar_path = avatarPath;
    await db.from('profiles').upsert([upsertData], { onConflict: 'id' });
  } catch(e) {}

  // 4. Propagar el nuevo nombre a los posts si cambió
  if (n !== oldName) {
    try {
      await db.from('posts').update({ username: n }).eq('user_id', S.me.id);
    } catch(e) {}
    S.posts.forEach(p => { if (p.user_id === S.me.id) p.username = n; });
  }

  if (btn) { btn.textContent = 'guardar'; btn.disabled = false; }
  S.modal = false;
  render();
  toast('perfil actualizado ✦');
}

// --- TOGGLE PASSWORD VISIBILITY ---
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

// --- VALIDACION INLINE AUTH ---
function validateLogin() {
  const email = document.getElementById('lu').value.trim();
  const pw = document.getElementById('lp').value;
  const err = document.getElementById('le');
  if (!email) { err.textContent = 'ingresa tu correo'; return false; }
  if (!email.includes('@')) { err.textContent = 'correo inválido'; return false; }
  if (!pw) { err.textContent = 'ingresa tu contraseña'; return false; }
  err.textContent = '';
  return true;
}

function validateRegister() {
  const user = document.getElementById('ru').value.trim();
  const email = document.getElementById('re').value.trim();
  const pw = document.getElementById('rp').value;
  const err = document.getElementById('ree');
  if (!user) { err.textContent = 'elige un nombre de usuario'; return false; }
  if (user.length < 3) { err.textContent = 'el nombre de usuario debe tener al menos 3 caracteres'; return false; }
  if (!email || !email.includes('@')) { err.textContent = 'correo inválido'; return false; }
  if (pw.length < 6) { err.textContent = 'la contraseña debe tener al menos 6 caracteres'; return false; }
  err.textContent = '';
  return true;
}

// Parchear login y register para validar antes de enviar
const _origLogin = login;
window.login = async function() {
  if (!validateLogin()) return;
  await _origLogin();
};
const _origRegister = register;
window.register = async function() {
  if (!validateRegister()) return;
  await _origRegister();
};

// Enter para enviar formularios de auth
document.addEventListener('DOMContentLoaded', () => {
  ['lu','lp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') window.login(); });
  });
  ['ru','re','rp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') window.register(); });
  });
  // Accesibilidad: logo navegable con teclado
  const logo = document.querySelector('.hlogo');
  if (logo) {
    logo.setAttribute('tabindex', '0');
    logo.setAttribute('role', 'button');
    logo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') gofeed(); });
  }
});

// --- SKELETON LOADING ---
function showSkeletons(n = 4) {
  const mc = document.getElementById('mc');
  if (!mc) return;
  const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
  mc.innerHTML = sk.repeat(n);
}

// --- INFINITE SCROLL ---
let _sentinel = null;
function setupInfiniteScroll() {
  if (_sentinel) { _sentinel.disconnect(); _sentinel = null; }
  const el = document.getElementById('scroll-sentinel');
  if (!el) return;
  _sentinel = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !S.loading) loadMore();
  }, { rootMargin: '300px' });
  _sentinel.observe(el);
}


// ======== FEATURE 1: EXPLORAR / DESTACADOS ========

async function goExplore() {
  S.explorePage = true; S.page = 'feed'; S.menu = null;
  renderPostMenu();
  document.title = 'explorar · sigilo';
  try { sessionStorage.setItem('sigilo_nav', JSON.stringify({ page: 'explore' })); } catch(e) {}
  nav();
  const mc = document.getElementById('mc');
  if (mc) {
    const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
    mc.innerHTML = `<div class="explore-page">
      <div class="explore-header">
        <button class="explore-back-btn" onclick="closeExplore()" title="volver">
          <i class="fi fi-rr-arrow-small-left" style="font-size:1.1rem"></i>
        </button>
        <div class="explore-title">explorar</div>
      </div>
      <div class="explore-sub">publicaciones populares de las últimas 48 horas ✦</div>
      ${sk.repeat(5)}
    </div>`;
  }
  mobSetActive('explore');
  await fetchExplorePosts();
}

function closeExplore() {
  S.explorePage = false;
  gofeed();
}

async function fetchExplorePosts() {
  const now = Date.now();
  if (_exploreCache && (now - _exploreCacheTs) < EXPLORE_TTL) {
    renderExplorePage(_exploreCache);
    return;
  }
  try {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from('posts')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    const posts = (data || []).map(p => ({
      ...p,
      likes: Array.isArray(p.likes) ? p.likes : [],
      cmts: Array.isArray(p.cmts) ? p.cmts : [],
      saved: Array.isArray(p.saved) ? p.saved : [],
      t: p.created_at
    })).sort((a, b) => b.likes.length - a.likes.length).slice(0, 30);
    posts.forEach(ep => {
      if (!S.posts.find(p => p.id === ep.id)) S.posts.push(ep);
    });

    // Batch-fetch perfiles de autores que no están en caché para tener avatares frescos
    const unknownAuthorIds = [...new Set(
      posts.map(p => p.user_id).filter(uid => uid !== S.me.id && !S.users.find(u => u.id === uid))
    )];
    if (unknownAuthorIds.length > 0) {
      try {
        const { data: profilesData } = await db.from('profiles')
          .select('id,username,display_name,avatar_url,avatar_path,bio')
          .in('id', unknownAuthorIds);
        if (profilesData) {
          await Promise.all(profilesData.map(async d => {
            let avatarUrl = d.avatar_url;
            if (d.avatar_path) {
              const signed = await getSignedAvatarUrl(d.id, d.avatar_path);
              if (signed) avatarUrl = signed;
            }
            const profile = { id: d.id, username: d.display_name || d.username, display_name: d.display_name || d.username, avatar_url: avatarUrl, bio: d.bio || '', _ts: Date.now() };
            const existing = S.users.findIndex(u => u.id === d.id);
            if (existing > -1) S.users[existing] = profile; else S.users.push(profile);
          }));
        }
      } catch(e) {}
    }

    _exploreCache = posts;
    _exploreCacheTs = Date.now();
    renderExplorePage(posts);
  } catch(e) {
    const mc = document.getElementById('mc');
    if (mc) mc.innerHTML = `<div class="explore-page">
      <div class="explore-header">
        <button class="explore-back-btn" onclick="closeExplore()"><i class="fi fi-rr-arrow-small-left" style="font-size:1.1rem"></i></button>
        <div class="explore-title">explorar</div>
      </div>
      <div class="explore-empty"><div class="ei">⚠️</div><div class="el">no se pudo cargar. intenta de nuevo.<br><br><button class="load-more-btn" onclick="fetchExplorePosts()">reintentar</button></div></div>
    </div>`;
  }
}

function renderExplorePage(posts) {
  const mc = document.getElementById('mc');
  if (!mc || !S.explorePage) return;
  const content = posts.length === 0
    ? `<div class="explore-empty"><div class="ei">🌸</div><div class="el">no hay publicaciones destacadas aún — vuelve más tarde ✦</div></div>`
    : `<div class="explore-section-label">✦ más populares hoy</div>` + posts.map((p, i) => {
        const trendingBadge = i < 3 ? `<span class="explore-trending-badge"><i class="fi fi-rr-star" style="font-size:.62rem"></i> top ${i+1}</span>` : '';
        return rpostExplore(p, trendingBadge);
      }).join('');
  mc.innerHTML = `<div class="explore-page">
    <div class="explore-header">
      <button class="explore-back-btn" onclick="closeExplore()" title="volver">
        <i class="fi fi-rr-arrow-small-left" style="font-size:1.1rem"></i>
      </button>
      <div class="explore-title">explorar</div>
    </div>
    <div class="explore-sub">publicaciones populares de las últimas 48 horas ✦</div>
    ${content}
  </div>`;
}

function rpostExplore(p, badge) {
  badge = badge || '';
  const likes = Array.isArray(p.likes)?p.likes:[];
  const saved  = Array.isArray(p.saved)?p.saved:[];
  const cmts   = Array.isArray(p.cmts)?p.cmts:[];
  const author = p.user_id === S.me.id
    ? { name: S.me.user_metadata?.display_name||S.me.email, username: S.me.user_metadata?.display_name||S.me.email, avatar_url: S.me.user_metadata?.avatar_url||p.author_av||null }
    : (S.users.find(x=>x.id===p.user_id) || { name:p.username||'Usuario', username:p.username||'Usuario', avatar_url:p.author_av||null });
  const liked = likes.includes(S.me.id);
  const isSaved = saved.includes(S.me.id);
  const own = p.user_id===S.me.id;
  const cid = safeId(p.id);
  return `
  <div class="pcard" id="post-${cid}">
    <div class="phead">
      ${avEl(author)}
      <div style="flex:1">
        <div class="puname" onclick="vprof('${p.user_id}')">${esc(author.username)}</div>
        <div class="ptime" data-ts="${p.created_at}">${ago(p.created_at)}</div>
      </div>
      <span class="pbadge">${esc(p.category)}</span>${badge}
      ${own?`<div class="mwrap"><button class="dotsbtn" onclick="tmenu('${p.id}',event)">...</button></div>`:''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn like-btn${liked?' liked':''}" onclick="tlike('${p.id}')"><i class="${liked?'fi fi-sr-heart':'fi fi-rr-heart'}"></i> ${likes.length}</button>
      <button class="abtn comment-btn" onclick="tcmt('${p.id}')"><i class="fi fi-rr-comment"></i> ${cmts.length}</button>
      <button class="abtn save-btn${isSaved?' sav':''}" onclick="tsave('${p.id}')"><i class="${isSaved?'fi fi-sr-bookmark':'fi fi-rr-bookmark'}"></i> ${isSaved?'guardado':'guardar'}</button>
      <button class="abtn copy-btn" onclick="copyPost('${p.id}')" title="copiar texto"><i class="fi fi-rr-copy"></i> copiar</button>
      <button class="abtn share-btn" onclick="sharePost('${p.id}',event)" title="compartir"><i class="fi fi-rr-share"></i><span class="share-label"> compartir</span></button>
    </div>
  </div>`;
}

// ======== FEATURE 2: ANCLAR POSTS EN PERFIL ========

function loadPinnedPosts() {
  try {
    const saved = JSON.parse(localStorage.getItem('sigilo_pinned') || '{}');
    S.pinnedPosts = saved;
  } catch(e) { S.pinnedPosts = {}; }
}

function savePinnedPostsToStorage() {
  try { localStorage.setItem('sigilo_pinned', JSON.stringify(S.pinnedPosts)); } catch(e) {}
}

function pinPost(postId) {
  postId = isNaN(postId)?postId:Number(postId);
  const p = findPost(postId); if(!p) return;
  if (p.user_id !== S.me.id) return;
  const uid_key = S.me.id;
  if (S.pinnedPosts[uid_key] === postId) {
    delete S.pinnedPosts[uid_key];
    toast('publicación desanclada');
  } else {
    S.pinnedPosts[uid_key] = postId;
    toast('publicación anclada ✦');
  }
  savePinnedPostsToStorage();
  S.menu = null;
  renderPostMenu();
  render();
}

// ======== FEATURE 3: LIKES EN COMENTARIOS ========

async function tlikeCmt(postId, cmtId) {
  postId = isNaN(postId)?postId:Number(postId);
  const p = findPost(postId); if(!p) return;
  if(!Array.isArray(p.cmts)) p.cmts=[];
  const cmt = p.cmts.find(c=>c.id===cmtId); if(!cmt) return;
  if(!Array.isArray(cmt.likes)) cmt.likes=[];
  const i = cmt.likes.indexOf(S.me.id);
  const wasLiked = i>-1;
  if(wasLiked) cmt.likes.splice(i,1); else cmt.likes.push(S.me.id);
  const isNowLiked = !wasLiked;
  const btn = document.querySelector(`[data-cmt-like="${cmtId}"]`);
  if(btn) {
    btn.className = `cmt-like-btn${isNowLiked?' liked':''}`;
    const icon = btn.querySelector('i');
    if(icon) icon.className = isNowLiked?'fi fi-sr-heart':'fi fi-rr-heart';
    const countEl = btn.querySelector('.cmt-like-count');
    if(countEl) countEl.textContent = cmt.likes.length > 0 ? cmt.likes.length : '';
    if(isNowLiked) {
      btn.classList.add('pop');
      setTimeout(()=>btn.classList.remove('pop'),260);
    }
  }
  const {error} = await db.from('posts').update({cmts:p.cmts}).eq('id',postId);
  if(error) {
    toast('Error al dar like');
    if(wasLiked) cmt.likes.push(S.me.id); else { const idx=cmt.likes.indexOf(S.me.id); if(idx>-1) cmt.likes.splice(idx,1); }
  }
}

// --- COPY con feedback visual ---
const _origCopyPost = copyPost;
window.copyPost = function(id) {
  const doFeedback = () => {
    // Cambiar ícono del botón momentáneamente
    const btn = document.querySelector(`#post-${safeId(id)} .copy-btn`);
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = 'fi fi-sr-copy';
        btn.classList.add('copy-done');
        icon.classList.add('pop');
        setTimeout(() => {
          icon.className = 'fi fi-rr-copy';
          btn.classList.remove('copy-done');
          icon.classList.remove('pop');
        }, 1400);
      }
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const post = findPost(isNaN(id)?id:Number(id));
    if (!post) return;
    navigator.clipboard.writeText(post.body).then(() => { toast('copiado'); doFeedback(); }).catch(() => { fallbackCopy(post.body); doFeedback(); });
  } else { _origCopyPost(id); doFeedback(); }
};

// --- NOTIF BADGE EN MÓVIL ---
const _origRenderNotifBadge = renderNotifBadge;
window.renderNotifBadge = function() {
  _origRenderNotifBadge();
  const count = S.notifs.filter(n => !n.read).length;
  const mobBadge = document.getElementById('mob-notif-badge');
  if (mobBadge) {
    mobBadge.textContent = count > 9 ? '9+' : (count || '');
    mobBadge.style.display = count > 0 ? 'flex' : 'none';
  }
};

// --- SETUP INFINITE SCROLL AL CARGAR EL FEED ---
const _origGofeed = gofeed;
window.gofeed = function() {
  _origGofeed();
  setTimeout(setupInfiniteScroll, 300);
};

// --- EXPOSE ---
window.tlike=tlike; window.tsave=tsave; window.tcmt=tcmt; window.scmt=scmt; window.dcmt=dcmt;
window.tocol=tocol; window.dpost=dpost; window.tmenu=tmenu; window.vprof=vprof;
window.post=post; window.setcat=setcat; window.setComposeCat=setComposeCat; window.stptab=stptab; window.loadMore=loadMore;
window.gofeed=gofeed; window.goprofile=goprofile; window.logout=logout;
window.openmod=openmod; window.closemod=closemod; window.mclose=mclose; window.savemod=savemod;
window.upavatar=upavatar; window.stab=stab; window.login=login; window.register=register;
window.openCreateFolder=openCreateFolder; window.openRenameFolder=openRenameFolder;
window.closeFolderForm=closeFolderForm; window.createFolder=createFolder;
window.renameFolder=renameFolder; window.deleteFolder=deleteFolder;
window.assignToFolder=assignToFolder; window.openFolderPicker=openFolderPicker;
window.closeFolderPicker=closeFolderPicker; window.toggleFolderView=toggleFolderView;
window.toggleSearch=toggleSearch; window.searchUsers=searchUsers; window.goSearchUser=goSearchUser;
window.havatar=havatar; window.copyPost=copyPost;
window.openEditPost=openEditPost; window.closeEditPost=closeEditPost; window.saveEditPost=saveEditPost;
window.toggleNotif=toggleNotif; window.goNotif=goNotif; window.clearNotifs=clearNotifs;
window.confirmAction=confirmAction; window.renderConfirmModal=renderConfirmModal;
window.togglePw=togglePw; window.renderPostMenu=renderPostMenu;
window.gosettings=gosettings; window.selectTheme=selectTheme; window.rsettings=rsettings;
window.goExplore=goExplore; window.closeExplore=closeExplore; window.fetchExplorePosts=fetchExplorePosts;
window.pinPost=pinPost; window.tlikeCmt=tlikeCmt; window.renderProfilePosts=renderProfilePosts;
window.fetchProfilePosts=fetchProfilePosts;
window.sharePost=sharePost; window.copyPostLink=copyPostLink; window.nativeShare=nativeShare;
window.startReply=startReply; window.cancelReply=cancelReply; window.renderComment=renderComment;

showLoading();
// Usar refreshSession en lugar de getSession para garantizar token válido y metadatos frescos
db.auth.refreshSession().then(({data, error})=>{
  if(data?.session){ S.me=data.session.user; boot(); }
  else {
    // Si no hay sesión activa, caer a getSession como fallback
    db.auth.getSession().then(({data:{session}})=>{
      if(session){ S.me=session.user; boot(); }
      else { hideLoading(); document.getElementById('auth').style.display='flex'; }
    });
  }
});

// ======== MOBILE BOTTOM NAV ========

function mobSetActive(tab) {
  ['mob-home','mob-explore','mob-community','mob-search','mob-notif','mob-profile','mob-settings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const map = { home:'mob-home', explore:'mob-explore', community:'mob-community', search:'mob-search', notif:'mob-notif', profile:'mob-profile', settings:'mob-settings' };
  const el = document.getElementById(map[tab]);
  if (el) el.classList.add('active');
}

function mobToggleSearch() {
  const panel = document.getElementById('mobSearchPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    mobCloseSearch();
  } else {
    panel.style.display = 'block';
    mobSetActive('search');
    setTimeout(() => document.getElementById('mobSearchInput')?.focus(), 60);
  }
}

function mobCloseSearch() {
  const panel = document.getElementById('mobSearchPanel');
  if (panel) panel.style.display = 'none';
  const inp = document.getElementById('mobSearchInput');
  if (inp) inp.value = '';
  const res = document.getElementById('mobSearchResults');
  if (res) res.innerHTML = '';
  // Restaurar activo según página actual
  if (S.page === 'feed') mobSetActive('home');
  else if (S.page === 'settings') mobSetActive('settings');
  else mobSetActive('profile');
}

let mobSearchTimeout = null;
async function mobSearchUsers() {
  const q = document.getElementById('mobSearchInput')?.value?.trim();
  const res = document.getElementById('mobSearchResults');
  if (!res) return;
  if (!q) { res.innerHTML = ''; return; }
  res.innerHTML = `<div class="s-empty">buscando...</div>`;
  clearTimeout(mobSearchTimeout);
  mobSearchTimeout = setTimeout(async () => {
    try {
      const { data, error } = await db.from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10);
      if (error || !data || data.length === 0) {
        res.innerHTML = `<div class="s-empty">no se encontraron usuarios</div>`; return;
      }
      const usersWithAv = await Promise.all(data.map(async u => {
        let av = u.avatar_url;
        if (u.avatar_path) {
          const signed = await getSignedAvatarUrl(u.id, u.avatar_path);
          if (signed) av = signed;
        }
        return { ...u, _resolved_av: av };
      }));
      res.innerHTML = usersWithAv.map(u => {
        const name = u.display_name || u.username || '?';
        return `<div class="s-row" onclick="mobGoSearchUser('${u.id}')">
          ${avEl({ display_name: name, avatar_url: u._resolved_av })}
          <span class="s-name">${esc(name)}</span>
        </div>`;
      }).join('');
    } catch(e) {
      res.innerHTML = `<div class="s-empty">error al buscar, intenta de nuevo</div>`;
    }
  }, 300);
}

function mobGoSearchUser(id) { mobCloseSearch(); vprof(id); }

// Inyectar botón salir en perfil (solo móvil)
function injectMobLogout() {
  if (window.innerWidth > 640) return;
  // El perfil se renderiza en .ppage, dentro de main#mc
  const ppage = document.querySelector('.ppage');
  if (!ppage) return;
  if (ppage.querySelector('.mob-logout-btn')) return; // ya existe
  ppage.style.position = 'relative';
  const btn = document.createElement('button');
  btn.className = 'mob-logout-btn';
  btn.title = 'Salir';
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>salir`;
  btn.onclick = logout;
  ppage.appendChild(btn);
}

// Patch nav() para sincronizar el estado activo del mob-nav
const _origNav = nav;
window.nav = function() {
  _origNav();
  // Sincronizar mob-nav active
  if (S.explorePage) mobSetActive('explore');
  else if (S.communityPage) mobSetActive('community');
  else if (S.page === 'settings') mobSetActive('settings');
  else if (S.page === 'profile') mobSetActive('profile');
  else mobSetActive('home');
};

// Patch render() para inyectar botón logout en perfil
const _origRender = typeof render === 'function' ? render : null;
if (_origRender) {
  window.render = function() {
    _origRender();
    setTimeout(injectMobLogout, 50);
  };
}

// Cerrar search móvil al hacer click fuera
document.addEventListener('click', e => {
  const panel = document.getElementById('mobSearchPanel');
  if (panel && panel.style.display !== 'none') {
    if (!e.target.closest('#mobSearchPanel') && !e.target.closest('#mob-search')) {
      mobCloseSearch();
    }
  }
});

// Exponer funciones móviles
window.mobToggleSearch = mobToggleSearch;
window.mobCloseSearch = mobCloseSearch;
window.mobSearchUsers = mobSearchUsers;
window.mobGoSearchUser = mobGoSearchUser;
window.mobSetActive = mobSetActive;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Sigilo PWA: Instalación lista ✅'))
      .catch(err => console.log('Sigilo PWA: Error ❌', err));
  });
}

function injectChatBtnIntoHeader() {
  const container = document.querySelector('.mob-header-actions');
  if (!container) return;
  const chatBtn = document.querySelector('.chat-mob-btn');
  if (!chatBtn || container.contains(chatBtn)) return;
  container.appendChild(chatBtn);
}
// Intentar inmediatamente y también después de un pequeño delay por si script_chat carga tarde
injectChatBtnIntoHeader();
setTimeout(injectChatBtnIntoHeader, 500);
setTimeout(injectChatBtnIntoHeader, 1500);
