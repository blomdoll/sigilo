// 1. Configuración de conexión
const supabaseUrl = 'https://mgzbmpcirzeaqfzrpiro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemJtcGNpcnplYXFmenJwaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQzNTgsImV4cCI6MjA5MzE1MDM1OH0.igJ1MqmbOSGCICdzWSqcl58zP7OTMQr3zF_g6t0F_1I';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let offset = 0; 
const PAGE_SIZE = 10; // Traeremos de 10 en 10

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
};

const CATS = ['todos', 'decoraciones', 'letras', 'simbolos', 'biografias', 'usernames', 'nombres'];
const MAX_CHARS = 500;
const uid = () => 'x' + Math.random().toString(36).slice(2);

const ago = ts => {
  if (!ts) return '';
  // Fuerza interpretación UTC: agrega Z si el string no tiene zona horaria
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
  const btn = document.querySelector('#rf .btn-fill');
  if (btn) { btn.textContent = 'creando cuenta...'; btn.disabled = true; }
  const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: username } } });
  if (btn) { btn.textContent = 'Crear cuenta'; btn.disabled = false; }
  if (error) document.getElementById('ree').textContent = error.message;
  else { toast('Cuenta creada! Revisa tu correo.'); S.me = data.user; boot(); }
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

function boot() {
  hideLoading();
  document.getElementById('auth').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex'; app.style.flexDirection = 'column'; app.style.minHeight = '100%';

  // Restaurar la pagina donde estaba el usuario antes de refrescar
  try {
    const saved = JSON.parse(sessionStorage.getItem('sigilo_nav') || 'null');
    if (saved && saved.page === 'profile' && saved.puid) {
      S.page = 'profile';
      S.puid = saved.puid;
      S.ptab = saved.ptab || 'posts';
      nav(); render();
      fetchPosts();
      fetchFolders();
      loadNotifs();
      return;
    }
  } catch(e) {}

  // Mostrar feed con skeletons mientras carga
  S.page = 'feed';
  nav();
  // Renderizar estructura del feed con skeletons
  const mc = document.getElementById('mc');
  if (mc) {
    const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
    mc.innerHTML = `
      <div class="ftitle">inicio</div>
      <div class="fsub">comparte decoraciones, letras, simbolos y mas</div>
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
      mc.innerHTML = `<div class="empty"><div class="ei">⚠️</div><div class="el">no se pudo cargar el feed. revisa tu conexión e intenta de nuevo.<br><br><button class="load-more-btn" onclick="fetchPosts()">reintentar</button></div></div>`;
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

async function loadMore() {
  const btn = document.querySelector('.load-more-btn');
  if (btn) { btn.textContent = 'cargando...'; btn.disabled = true; }
  
  await fetchPosts(false); // Llamamos con reset=false para que sume al offset
  
  if (btn) { btn.textContent = 'cargar mas'; btn.disabled = false; }
}

async function logout() {
  unsubscribeNotifs();
  await db.auth.signOut();
  S.me = null; S.notifs = []; S.notifOpen = false;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('lu').value = ''; document.getElementById('lp').value = '';
  stab('login');
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
    bd.style.cssText = 'position:fixed;inset:0;z-index:89;display:none;';
    bd.addEventListener('click', () => { S.notifOpen=false; renderNotifPanel(); });
    document.body.appendChild(bd);
  }
  bd.style.display = 'block';
  const items = S.notifs.length === 0
    ? `<div class="s-empty" style="padding:1.2rem .6rem">sin notificaciones aun</div>`
    : S.notifs.slice(0,20).map(n => `
      <div class="notif-row" onclick="goNotif('${n.postId}')">
        <span class="notif-icon">${n.type==='like'?'♡':'◌'}</span>
        <div class="notif-body">
          <span class="notif-name">${esc(n.fromName)}</span>
          ${n.type==='like'?' le dio like a tu publicacion':' comento en tu publicacion'}
          ${n.postBody?`<div class="notif-preview">${esc(n.postBody)}</div>`:''}
        </div>
        <span class="notif-time" data-ts="${n.ts}">${ago(n.ts)}</span>
      </div>`).join('');
  el.innerHTML = `<div class="notif-panel">
    <div class="notif-head">
      <span>notificaciones</span>
      ${S.notifs.length>0?`<button class="notif-clear" onclick="clearNotifs()">limpiar</button>`:''}
    </div>
    ${items}
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
    if (!error && data) { S.folders = data; render(); }
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
  const p = S.posts.find(x => x.id === postId); if (!p) return;
  const newFolder = p.folder_id === folderId ? null : folderId;
  p.folder_id = newFolder;
  if (newFolder) p.col = true;
  try { await db.from('posts').update({ folder_id: newFolder, col: p.col }).eq('id', postId); } catch(e) {}
  S.folderPostModal = null; toast(newFolder ? 'anadido a carpeta' : 'eliminado de carpeta'); render();
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
    const seen = new Set(), matches = [];
    // Local cache
    for (const p of S.posts) {
      if (!seen.has(p.user_id)) {
        const name = p.username || '';
        if (name.toLowerCase().includes(q.toLowerCase())) {
          seen.add(p.user_id);
          matches.push({ id: p.user_id, username: name, av: p.author_av });
        }
      }
    }
    // DB search for users not in cache
    try {
      const { data } = await db.from('posts').select('user_id,username,author_av').ilike('username', '%'+q+'%').limit(10);
      if (data) {
        for (const row of data) {
          if (!seen.has(row.user_id)) {
            seen.add(row.user_id);
            matches.push({ id: row.user_id, username: row.username, av: row.author_av });
          }
        }
      }
    } catch(e) {}

    if (matches.length === 0) { res.innerHTML = `<div class="s-empty">no se encontraron usuarios</div>`; return; }
    res.innerHTML = matches.slice(0,8).map(u => `
      <div class="s-row" onclick="goSearchUser('${u.id}')">
        ${u.av?`<div class="av"><img src="${esc(u.av)}" alt=""/></div>`:`<div class="av">${(u.username[0]||'?').toUpperCase()}</div>`}
        <span class="s-name">${esc(u.username)}</span>
      </div>`).join('');
  }, 300);
}

function goSearchUser(id) { toggleSearch(); vprof(id); }

// --- NAVEGACION ---
function saveNavState() {
  try { sessionStorage.setItem('sigilo_nav', JSON.stringify({ page: S.page, puid: S.puid, ptab: S.ptab })); } catch(e) {}
}

function gofeed() { S.page='feed'; S.puid=null; S.menu=null; saveNavState(); document.title='inicio · sigilo'; nav(); render(); }
function goprofile() { S.page='profile'; S.puid=S.me.id; S.ptab='posts'; S.menu=null; saveNavState(); document.title='perfil · sigilo'; nav(); render(); }
function vprof(id) { S.page='profile'; S.puid=id; S.ptab='posts'; S.menu=null; saveNavState(); document.title='perfil · sigilo'; nav(); render(); }

function nav() {
  ['nf','np'].forEach(id => { const el=document.getElementById(id); if(el) el.className='nbtn'; });
  const el = document.getElementById(S.page==='feed'?'nf':'np'); if(el) el.className='nbtn on';
}

function avEl(user, big = false, canEdit = false) {
  const cls = big ? 'pav' : 'av';
  // Obtenemos el nombre para las iniciales
  const name = user?.user_metadata?.display_name || user?.display_name || user?.name || user?.username || user?.email || '?';
  const ini = name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?';
  
  // Buscamos la URL del avatar en las distintas propiedades posibles
  const avatarUrl = user?.user_metadata?.avatar_url || user?.avatar_url || user?.av || null;
  
  // Solo mostramos el overlay de "cambiar foto" si es el perfil grande Y el usuario tiene permiso
  const overlay = (big && canEdit) ? '<div class="pavov">cambiar foto</div>' : '';

  if (avatarUrl) {
    return `<div class="${cls}"><img src="${esc(avatarUrl)}" alt=""/>${overlay}</div>`;
  }
  return `<div class="${cls}">${ini}${overlay}</div>`;
}

function render() {
  const mc = document.getElementById('mc');
  if (mc) mc.innerHTML = S.page==='feed' ? rfeed() : rprofile();
  renderFolderPickerModal();
  renderFolderFormModal();
  renderEditModal();
  renderNotifPanel();
  renderConfirmModal();
  renderNotifBadge();
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
  const post = S.posts.find(x => x.id === S.folderPostModal);
  const myFolders = S.folders.filter(f => f.user_id === S.me.id);
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeFolderPicker()">
    <div class="mdl">
      <div class="mdlt">Guardar en carpeta</div>
      ${myFolders.length===0
        ? `<div class="empty"><div class="ei">📂</div><div class="el">aun no tienes carpetas. Crea una desde colecciones.</div></div>`
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
      <div class="mdlt">${isRename?'Renombrar carpeta':'Nueva carpeta'}</div>
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
  const p = S.posts.find(x => x.id === S.editModal);
  if (!p) { el.innerHTML=''; return; }
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeEditPost()">
    <div class="mdl">
      <div class="mdlt">Editar publicacion</div>
      <div class="field">
        <label>Categoria</label>
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
  if (!body) return toast('el contenido no puede estar vacio');
  if (body.length > MAX_CHARS) return toast('maximo '+MAX_CHARS+' caracteres');
  const { error } = await db.from('posts').update({ body, category }).eq('id', id);
  if (error) return toast('Error al guardar');
  const p = S.posts.find(x => x.id === id);
  if (p) { p.body = body; p.category = category; }
  S.editModal = null; toast('publicacion editada'); render();
}

// --- FEED ---
function rfeed() {
  const posts = S.cat==='todos' ? [...S.posts] : S.posts.filter(p=>p.category===S.cat);
  const composeCat = S.composeCat || CATS[1]; // default primera categoría
  return `
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, simbolos y mas</div>
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
  <div class="cats">${CATS.map(c=>`<button class="catb${S.cat===c?' on':''}" onclick="setcat('${c}')">${c}</button>`).join('')}</div>
  ${posts.length===0
    ? `<div class="empty"><div class="ei">🌸</div><div class="el">todavia no hay publicaciones aqui — se el primero ✦</div></div>`
    : posts.map(rpost).join('') + `<div id="scroll-sentinel" style="height:1px;margin:1rem 0"></div>`
  }`;
}

function rpost(p) {
  const likes = Array.isArray(p.likes)?p.likes:[];
  const saved  = Array.isArray(p.saved)?p.saved:[];
  const cmts   = Array.isArray(p.cmts)?p.cmts:[];
  const author = S.users.find(x=>x.id===p.user_id)||{ name:p.username||'Usuario', username:p.username||'Usuario', avatar_url:p.author_av||null };
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
        ${mopen?`<div class="pmenu">
          <button class="mi" onclick="openEditPost('${p.id}')">✎ editar</button>
          <button class="mi" onclick="tocol('${p.id}')">⊞ ${p.col?'quitar de coleccion':'guardar en coleccion'}</button>
          ${p.col?`<button class="mi" onclick="openFolderPicker('${p.id}')">📁 ${p.folder_id?'mover de carpeta':'poner en carpeta'}</button>`:''}
          <button class="mi del" onclick="confirmAction('Eliminar esta publicacion? No se puede deshacer.',()=>dpost(${p.id}))">✕ eliminar</button>
        </div>`:''}
      </div>`:''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn${liked?' liked':''}" onclick="tlike('${p.id}')">♡ ${likes.length}</button>
      <button class="abtn" onclick="tcmt('${p.id}')">◌ ${cmts.length}</button>
      <button class="abtn${isSaved?' sav':''}" onclick="tsave('${p.id}')">◈ ${isSaved?'guardado':'guardar'}</button>
      <button class="abtn copy-btn" onclick="copyPost('${p.id}')" title="copiar texto">⎘ copiar</button>
    </div>
    ${copen?`<div class="csec">
      <div class="crow">
        <input class="cinput" id="${cid}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${p.id}')"/>
        <button class="sendbtn" onclick="scmt('${p.id}')">↑</button>
      </div>
      ${cmts.map((c,ci)=>`<div class="cm">
        <div onclick="vprof('${c.uid}')" style="cursor:pointer" title="ver perfil">${avEl({name:c.un,username:c.un,avatar_url:c.av||null})}</div>
        <div class="cmb">
          <div class="cma">
            <span>${esc(c.un)}</span>
            <span class="cmt-time" data-ts="${c.t}">${ago(c.t)}</span>
      ${c.uid === S.me.id ? `<button class="cmt-del" onclick="dcmt('${p.id}', '${c.id}')" title="eliminar comentario">✕</button>` : ''}
          </div>
          <div class="cmt">${esc(c.txt)}</div>
        </div>
      </div>`).join('')}
    </div>`:''}
  </div>`;
}

// PERFIL
function rprofile() {
  const own = S.puid === S.me.id;
  
  // CORRECCIÓN: Si no es nuestro perfil, buscamos los datos en los posts cargados
  // ya que S.users suele estar vacío inicialmente
  let user;
  if (own) {
    user = S.me;
  } else {
    const authorData = S.posts.find(p => p.user_id === S.puid);
    user = S.users.find(x => x.id === S.puid) || { 
      username: authorData?.username || 'Usuario', 
      avatar_url: authorData?.author_av || null,
      id: S.puid 
    };
  }

  const tab = S.ptab;
  const myp = S.posts.filter(p => p.user_id === S.puid);
  const svd = S.posts.filter(p => Array.isArray(p.saved) && p.saved.includes(S.me.id));
  const col = S.posts.filter(p => p.user_id === S.puid && p.col);
  const userFolders = S.folders.filter(f => f.user_id === S.puid);

  return `
  <div class="ppage">
    <div class="pavwrap">
      <div class="pav" ${own ? 'onclick="upavatar()"' : ''} style="${own ? 'cursor:pointer' : 'cursor:default'}">
        <!-- Pasamos 'own' como tercer argumento para que el mensaje no salga en perfiles ajenos -->
        ${avEl(user, true, own)} 
      </div>
    </div>
    <input type="file" id="avup" accept="image/*" style="display:none" onchange="havatar(event)"/>
    <div class="pinfo">
      <div class="pname">${esc(user.user_metadata?.display_name || user.username || user.name || user.email)}</div>
      <div class="pbio">${esc(user.user_metadata?.bio || user.bio || 'sin biografia aun')}</div>
      ${own ? `<button class="editbtn" onclick="openmod()">editar perfil</button>` : ''}
    </div>
    <div class="ptabs">
      <button class="ptab${tab === 'posts' ? ' on' : ''}" onclick="stptab('posts')">publicaciones</button>
      <button class="ptab${tab === 'col' ? ' on' : ''}" onclick="stptab('col')">colecciones</button>
      ${own ? `<button class="ptab${tab === 'saved' ? ' on' : ''}" onclick="stptab('saved')">guardados</button>` : ''}
    </div>
    ${tab === 'posts' ? (myp.length ? myp.map(rpost).join('') : `<div class="empty"><div class="el">aun no hay publicaciones</div></div>`) : ''}
    ${tab === 'saved' ? (svd.length ? svd.map(rpost).join('') : `<div class="empty"><div class="el">aun no guardaste nada</div></div>`) : ''}
    ${tab === 'col' ? renderCollections(userFolders, col, own) : ''}
  </div>
  ${S.modal ? `<div class="mov" onclick="mclose(event)">
    <div class="mdl">
      <div class="mdlt">Editar perfil</div>
      <div class="field"><label>Nombre</label><input id="en" value="${esc(S.me.user_metadata?.display_name || S.me.name || '')}"/></div>
      <div class="field"><label>Biografia</label><textarea id="eb" placeholder="cuentanos de ti...">${esc(S.me.user_metadata?.bio || S.me.bio || '')}</textarea></div>
      <div class="macts">
        <button class="cancelbtn" onclick="closemod()">cancelar</button>
        <button class="savebtn" onclick="savemod()">guardar</button>
      </div>
    </div>
  </div>` : ''}`;
}

function renderCollections(userFolders, col, own) {
  const uncategorized = col.filter(p => !p.folder_id || !userFolders.find(f=>f.id===p.folder_id));
  let html = '';
  if (own) html += `<div class="folder-toolbar"><button class="folder-new-btn" onclick="openCreateFolder()">+ nueva carpeta</button></div>`;
  if (col.length===0 && userFolders.length===0) {
    return html + `<div class="empty"><div class="ei">📂</div><div class="el">${own?'usa el menu ... de tus publicaciones para guardar en colecciones':'este usuario no tiene colecciones aun'}</div></div>`;
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
            <button class="folder-act-btn del" onclick="confirmAction('Eliminar la carpeta?',()=>deleteFolder('${f.id}'))" title="eliminar">✕</button>
          </div>`:''}
          <span class="folder-chevron">${isActive?'▲':'▼'}</span>
        </div>
        ${isActive?`<div class="folder-posts">
          ${fPosts.length===0?`<div class="empty"><div class="el">esta carpeta esta vacia</div></div>`:fPosts.map(rpost).join('')}
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
  if (S.menu===id) { S.menu=null; render(); return; }
  S.menu=id;
  render();
}

document.addEventListener('click', e => {
  if (S.menu && !e.target.closest('.mwrap')) { S.menu=null; render(); }
  if (S.searchOpen && !e.target.closest('#searchOverlay') && !e.target.closest('#ns')) toggleSearch();
  // Fix móvil: excluir también #mob-notif para que el tap no abra+cierre al mismo tiempo
  if (S.notifOpen && !e.target.closest('#notifPanel') && !e.target.closest('#notif-btn') && !e.target.closest('#mob-notif')) {
    S.notifOpen=false; renderNotifPanel();
  }
});

async function post() {
  const txt = document.getElementById('ct').value.trim();
  const cat = S.composeCat || CATS[1];
  if (!txt) return toast('escribe algo primero');
  if (txt.length > MAX_CHARS) return toast('maximo '+MAX_CHARS+' caracteres');
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
  const p = S.posts.find(x=>x.id===id); if(!p) return;
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

async function tlike(id) {
  id=isNaN(id)?id:Number(id);
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  if(!Array.isArray(p.likes)) p.likes=[];
  const i=p.likes.indexOf(S.me.id);
  const wasLiked = i>-1;
  if(wasLiked) p.likes.splice(i,1); else p.likes.push(S.me.id);
  // Patch solo el botón de like sin re-render completo
  const cid = safeId(id);
  const btn = document.querySelector(`#post-${cid} .abtn.liked, #post-${cid} .abtn:first-child`);
  const likeBtn = document.querySelector(`#post-${cid} .pacts .abtn`);
  if (likeBtn) {
    likeBtn.textContent = `♡ ${p.likes.length}`;
    likeBtn.className = `abtn${p.likes.includes(S.me.id) ? ' liked' : ''}`;
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
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  if(!Array.isArray(p.saved)) p.saved=[];
  const i=p.saved.indexOf(S.me.id);
  if(i>-1){p.saved.splice(i,1);}else{p.saved.push(S.me.id);}
  // Patch solo el botón de guardar sin re-render completo
  const cid = safeId(id);
  const pacts = document.querySelector(`#post-${cid} .pacts`);
  if (pacts) {
    const saveBtn = [...pacts.querySelectorAll('.abtn')].find(b => b.textContent.includes('guardar') || b.classList.contains('sav'));
    if (saveBtn) {
      const isSaved = p.saved.includes(S.me.id);
      saveBtn.className = `abtn${isSaved ? ' sav' : ''}`;
      saveBtn.textContent = `◈ ${isSaved ? 'guardado' : 'guardar'}`;
    }
  }
  toast(p.saved.includes(S.me.id) ? 'guardado' : 'eliminado de guardados');
  const {error}=await db.from('posts').update({saved:p.saved}).eq('id',id);
  if(error) { toast('Error al guardar'); render(); }
}

async function tocol(id) {
  id=isNaN(id)?id:Number(id);
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  p.col=!p.col; if(!p.col) p.folder_id=null;
  // Cerrar menú sin re-render completo
  S.menu=null;
  const cid = safeId(id);
  const card = document.getElementById('post-' + cid);
  if (card) { const menu = card.querySelector('.pmenu'); if (menu) menu.remove(); }
  const {error}=await db.from('posts').update({col:p.col,folder_id:p.folder_id||null}).eq('id',id);
  if(error) toast('Error al actualizar coleccion');
  else { toast(p.col?'anadido a coleccion':'eliminado de coleccion'); }
}

async function dpost(id) {
  id=isNaN(id)?id:Number(id);
  const {error}=await db.from('posts').delete().eq('id',id);
  if(error) toast('Error al eliminar');
  else { S.posts=S.posts.filter(x=>x.id!==id); S.menu=null; toast('publicacion eliminada'); render(); }
}

function tcmt(id) {
  id=isNaN(id)?id:Number(id);
  S.coOpen[id]=!S.coOpen[id];
  const cid = safeId(id);
  const card = document.getElementById(`post-${cid}`);
  if (!card) { render(); return; }
  const p = S.posts.find(x=>x.id===id);
  if (!p) { render(); return; }
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
  csec.innerHTML = `
    <div class="crow">
      <input class="cinput" id="${cid}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${id}')"/>
      <button class="sendbtn" onclick="scmt('${id}')">↑</button>
    </div>
    ${cmts.map((c,ci)=>`<div class="cm">
      <div onclick="vprof('${c.uid}')" style="cursor:pointer" title="ver perfil">${avEl({name:c.un,username:c.un,avatar_url:c.av||null})}</div>
      <div class="cmb">
        <div class="cma">
          <span>${esc(c.un)}</span>
          <span class="cmt-time" data-ts="${c.t}">${ago(c.t)}</span>
          ${c.uid === S.me.id ? `<button class="cmt-del" onclick="dcmt('${id}', '${c.id}')" title="eliminar comentario">✕</button>` : ''}
        </div>
        <div class="cmt">${esc(c.txt)}</div>
      </div>
    </div>`).join('')}`;
  // Update comment count button
  const cmtBtn = [...card.querySelectorAll('.pacts .abtn')].find(b => b.textContent.includes('◌'));
  if (cmtBtn) cmtBtn.textContent = `◌ ${cmts.length}`;
  setTimeout(() => document.getElementById(cid)?.focus(), 30);
}

async function scmt(id) {
  id = isNaN(id) ? id : Number(id);
  const inp = document.getElementById(safeId(id)); 
  if (!inp) return;
  const txt = inp.value.trim(); 
  if (!txt) return;

  const p = S.posts.find(x => x.id === id); 
  if (!p) return;
  if (!Array.isArray(p.cmts)) p.cmts = [];

  const myName = S.me.user_metadata?.display_name || S.me.email;
  
  const nuevoComentario = {
    id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5),
    uid: S.me.id,
    un: myName,
    av: S.me.user_metadata?.avatar_url || null,
    txt,
    t: new Date().toISOString()
  };

  p.cmts.push(nuevoComentario);

  const { error } = await db.from('posts').update({ cmts: p.cmts }).eq('id', id);

  if (error) {
    p.cmts.pop();
    toast('Error al comentar');
  } else {
    inp.value = '';
    if (p.user_id !== S.me.id) {
      const myName2 = S.me.user_metadata?.display_name||S.me.email;
      saveNotif(p.user_id, 'comment', myName2, id, p.body);
    }
    // Patch solo la sección de comentarios sin re-render completo
    const cid = safeId(id);
    const card = document.getElementById(`post-${cid}`);
    const csec = card?.querySelector('.csec');
    if (csec) {
      // Añadir el nuevo comentario al DOM
      const cmDiv = document.createElement('div');
      cmDiv.className = 'cm';
      cmDiv.innerHTML = `
        <div onclick="vprof('${nuevoComentario.uid}')" style="cursor:pointer" title="ver perfil">${avEl({name:nuevoComentario.un,username:nuevoComentario.un,avatar_url:nuevoComentario.av||null})}</div>
        <div class="cmb">
          <div class="cma">
            <span>${esc(nuevoComentario.un)}</span>
            <span class="cmt-time" data-ts="${nuevoComentario.t}">${ago(nuevoComentario.t)}</span>
            <button class="cmt-del" onclick="dcmt('${id}', '${nuevoComentario.id}')" title="eliminar comentario">✕</button>
          </div>
          <div class="cmt">${esc(nuevoComentario.txt)}</div>
        </div>`;
      csec.appendChild(cmDiv);
      // Update comment count
      const cmtBtn = [...(card?.querySelectorAll('.pacts .abtn')||[])].find(b => b.textContent.includes('◌'));
      if (cmtBtn) cmtBtn.textContent = `◌ ${p.cmts.length}`;
    }
  }
}

async function dcmt(postId, cmtId) {
  postId = isNaN(postId) ? postId : Number(postId);
  const p = S.posts.find(x => x.id === postId); 
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
      const cmtBtn = [...(card?.querySelectorAll('.pacts .abtn')||[])].find(b => b.textContent.includes('◌'));
      if (cmtBtn) cmtBtn.textContent = `◌ ${nuevosComentarios.length}`;
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
  const {error:upErr}=await db.storage.from('avatars').upload(path,f,{upsert:true,contentType:f.type});
  if(upErr){toast('Error al subir imagen');return;}

  // URL limpia sin cache-buster — es lo que se guarda en Auth y BD
  const {data}=db.storage.from('avatars').getPublicUrl(path);
  const cleanUrl=data.publicUrl;
  // Cache-buster SOLO para forzar recarga visual en el navegador actual (no se persiste)
  const displayUrl=cleanUrl+'?t='+Date.now();

  const {error:authErr}=await db.auth.updateUser({data:{avatar_url:cleanUrl}});
  if(authErr){toast('Error al guardar avatar');return;}

  // Guardar cleanUrl en Auth y BD; displayUrl solo en memoria local para esta sesión
  S.me.user_metadata.avatar_url=displayUrl;
  await db.from('posts').update({author_av:cleanUrl}).eq('user_id',S.me.id);
  // Actualizar posts locales con displayUrl para que el cambio sea visible de inmediato
  S.posts.forEach(p=>{ if(p.user_id===S.me.id) p.author_av=displayUrl; });
  render(); toast('foto actualizada');
}

function openmod(){S.modal=true;render();}
function closemod(){S.modal=false;render();}
function mclose(e){if(e.target===e.currentTarget)closemod();}

async function savemod() {
  const n=document.getElementById('en').value.trim(), b=document.getElementById('eb').value.trim();
  if(!n) return;
  const {error}=await db.auth.updateUser({data:{display_name:n,bio:b}});
  if(error) toast('Error al guardar perfil');
  else { S.me.user_metadata.display_name=n; S.me.user_metadata.bio=b; S.modal=false; render(); toast('perfil actualizado'); }
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
  if (!email.includes('@')) { err.textContent = 'correo invalido'; return false; }
  if (!pw) { err.textContent = 'ingresa tu contraseña'; return false; }
  err.textContent = '';
  return true;
}

function validateRegister() {
  const name = document.getElementById('rn').value.trim();
  const user = document.getElementById('ru').value.trim();
  const email = document.getElementById('re').value.trim();
  const pw = document.getElementById('rp').value;
  const err = document.getElementById('ree');
  if (!name) { err.textContent = 'ingresa tu nombre'; return false; }
  if (!user) { err.textContent = 'elige un nombre de usuario'; return false; }
  if (!email || !email.includes('@')) { err.textContent = 'correo invalido'; return false; }
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
  ['rn','ru','re','rp'].forEach(id => {
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
    if (entries[0].isIntersecting) loadMore();
  }, { rootMargin: '200px' });
  _sentinel.observe(el);
}

// --- COPY con feedback visual ---
const _origCopyPost = copyPost;
window.copyPost = function(id) {
  id = isNaN(id)?id:Number(id);
  const p = S.posts.find(x=>x.id===id); if(!p) return;
  const doFeedback = () => {
    // Cambiar ícono del botón momentáneamente
    const btn = document.querySelector(`#post-${safeId(id)} .copy-btn`);
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ copiado';
      btn.classList.add('copy-done');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copy-done'); }, 1400);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(p.body).then(() => { toast('copiado'); doFeedback(); }).catch(() => { fallbackCopy(p.body); doFeedback(); });
  } else { fallbackCopy(p.body); doFeedback(); }
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
window.togglePw=togglePw;

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
  ['mob-home','mob-search','mob-notif','mob-profile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const map = { home:'mob-home', search:'mob-search', notif:'mob-notif', profile:'mob-profile' };
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
  mobSetActive(S.page === 'feed' ? 'home' : 'profile');
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
    const seen = new Set(), matches = [];
    for (const p of S.posts) {
      if (!seen.has(p.user_id)) {
        const name = p.username || '';
        if (name.toLowerCase().includes(q.toLowerCase())) {
          seen.add(p.user_id); matches.push({ id: p.user_id, username: name, av: p.author_av });
        }
      }
    }
    try {
      const { data } = await db.from('posts').select('user_id,username,author_av').ilike('username', '%'+q+'%').limit(10);
      if (data) {
        for (const row of data) {
          if (!seen.has(row.user_id)) {
            seen.add(row.user_id); matches.push({ id: row.user_id, username: row.username, av: row.author_av });
          }
        }
      }
    } catch(e) {}
    if (matches.length === 0) { res.innerHTML = `<div class="s-empty">no se encontraron usuarios</div>`; return; }
    res.innerHTML = matches.slice(0,8).map(u => `
      <div class="s-row" onclick="mobGoSearchUser('${u.id}')">
        ${u.av?`<div class="av"><img src="${esc(u.av)}" alt=""/></div>`:`<div class="av">${(u.username[0]||'?').toUpperCase()}</div>`}
        <span class="s-name">${esc(u.username)}</span>
      </div>`).join('');
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
  if (S.page === 'feed') mobSetActive('home');
  else if (S.page === 'profile') mobSetActive('profile');
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
