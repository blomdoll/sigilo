// 1. Configuración de conexión
const supabaseUrl = 'https://mgzbmpcirzeaqfzrpiro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemJtcGNpcnplYXFmenJwaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQzNTgsImV4cCI6MjA5MzE1MDM1OH0.igJ1MqmbOSGCICdzWSqcl58zP7OTMQr3zF_g6t0F_1I';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

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
  menu: null
};

const CATS = ['todos', 'decoraciones', 'letras', 'símbolos', 'biografías', 'usernames', 'nombres'];
const uid = () => 'x' + Math.random().toString(36).slice(2);

const ago = ts => { 
  const d = Date.now() - new Date(ts).getTime(); 
  return d < 60000 ? 'ahora' : d < 3600000 ? ~~(d / 60000) + 'm' : d < 86400000 ? ~~(d / 3600000) + 'h' : ~~(d / 86400000) + 'd'; 
};

const esc = s => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

// FIX 1: Los UUIDs de Supabase tienen guiones que pueden causar problemas como IDs de DOM.
// Esta función convierte el UUID en un string seguro para usar como id= en HTML.
const safeId = id => 'p' + String(id).replace(/[^a-zA-Z0-9]/g, '_');

function toast(m) { 
  const t = document.getElementById('toast'); 
  if(t) {
    t.textContent = m; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 2000);
  }
}

function stab(tab) {
  const loginForm = document.getElementById('lf');
  const registerForm = document.getElementById('rf');
  const tabLogin = document.getElementById('tl');
  const tabRegister = document.getElementById('tr');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('on');
    tabRegister.classList.remove('on');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabRegister.classList.add('on');
    tabLogin.classList.remove('on');
  }
}

// --- AUTENTICACIÓN ---

async function login() {
  const email = document.getElementById('lu').value.trim();
  const password = document.getElementById('lp').value;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    document.getElementById('le').textContent = 'Error: ' + error.message;
  } else {
    S.me = data.user;
    boot();
  }
}

async function register() {
  const email = document.getElementById('re').value.trim();
  const password = document.getElementById('rp').value;
  const username = document.getElementById('ru').value.trim();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { display_name: username } }
  });
  if (error) {
    document.getElementById('ree').textContent = error.message;
  } else {
    toast('¡Cuenta creada! Revisa tu correo de confirmación.');
    S.me = data.user; 
    boot();
  }
}

function boot() {
  document.getElementById('auth').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').style.flexDirection = 'column';
  document.getElementById('app').style.minHeight = '100%';
  fetchPosts();
  gofeed();
}

async function fetchPosts() {
  const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false });
  if (!error) {
    S.posts = data.map(p => ({
      ...p,
      // FIX 2: Supabase devuelve null si la columna no tiene valor guardado.
      // Nos aseguramos de que siempre sean arrays, nunca null.
      likes: Array.isArray(p.likes) ? p.likes : [],
      cmts:  Array.isArray(p.cmts)  ? p.cmts  : [],
      saved: Array.isArray(p.saved) ? p.saved : [],
      t: p.created_at
    }));
    render();
  }
}

async function logout() {
  await db.auth.signOut();
  S.me = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('lu').value = ''; 
  document.getElementById('lp').value = '';
  stab('login');
}

// --- NAVEGACIÓN Y RENDER ---

function gofeed() { S.page = 'feed'; S.puid = null; S.menu = null; nav(); render(); }
function goprofile() { S.page = 'profile'; S.puid = S.me.id; S.ptab = 'posts'; S.menu = null; nav(); render(); }
function vprof(id) { S.page = 'profile'; S.puid = id; S.ptab = 'posts'; S.menu = null; nav(); render(); }

function nav() {
  ['nf', 'np'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.className = 'nbtn';
  });
  const active = S.page === 'feed' ? 'nf' : 'np';
  const elActive = document.getElementById(active);
  if(elActive) elActive.className = 'nbtn on';
}

function avEl(user, big = false) {
  const cls = big ? 'pav' : 'av';
  // FIX 3: Se revisan más rutas posibles para el nombre, con fallback seguro.
  const name = user?.user_metadata?.display_name || user?.display_name || user?.name || user?.username || user?.email || '?';
  const ini = name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?';
  
  if (user?.av) return `<div class="${cls}"><img src="${esc(user.av)}" alt=""/>${big ? '<div class="pavov">cambiar foto</div>' : ''}</div>`;
  return `<div class="${cls}">${ini}${big ? '<div class="pavov">cambiar foto</div>' : ''}</div>`;
}

function render() {
  const mc = document.getElementById('mc');
  if (mc) mc.innerHTML = S.page === 'feed' ? rfeed() : rprofile();
}

function rfeed() {
  const posts = (S.cat === 'todos' ? [...S.posts] : S.posts.filter(p => p.category === S.cat));
  return `
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, símbolos y más ✦</div>
  <div class="ccard">
    <div class="ctop">${avEl(S.me)}<textarea class="ctxt" id="ct" placeholder="comparte algo bonito... ✦"></textarea></div>
    <div class="cbot">
      <select class="csel" id="cc">${CATS.slice(1).map(c => `<option>${c}</option>`).join('')}</select>
      <button class="pbtn" onclick="post()">publicar ✦</button>
    </div>
  </div>
  <div class="cats">${CATS.map(c => `<button class="catb${S.cat === c ? ' on' : ''}" onclick="setcat('${c}')">${c}</button>`).join('')}</div>
  ${posts.length === 0 ? `<div class="empty"><div class="ei">🌸</div><div class="el">aún no hay publicaciones aquí</div></div>` : posts.map(rpost).join('')}`;
}

function rpost(p) {
  // FIX 2 (también aquí): doble garantía por si el post llega de otro lado sin pasar por fetchPosts
  const likes = Array.isArray(p.likes) ? p.likes : [];
  const saved  = Array.isArray(p.saved)  ? p.saved  : [];
  const cmts   = Array.isArray(p.cmts)   ? p.cmts   : [];

  const author = S.users.find(x => x.id === p.user_id) || { 
    name: p.username || 'Usuario', 
    username: p.username || 'Usuario', 
    av: p.author_av 
  };
  const liked = likes.includes(S.me.id);
  const isSaved = saved.includes(S.me.id);
  const own = p.user_id === S.me.id;
  const mopen = S.menu === p.id;
  const copen = S.coOpen[p.id];

  // FIX 1: Usamos safeId() para el id del input de comentarios.
  // El UUID real se sigue pasando como argumento a las funciones JS (eso funciona bien).
  const cid = safeId(p.id);

  return `
  <div class="pcard">
    <div class="phead">
      ${avEl(author)}
      <div style="flex:1">
        <div class="puname" onclick="vprof('${p.user_id}')">${esc(author.username)}</div>
        <div class="ptime">${ago(p.created_at)}</div>
      </div>
      <span class="pbadge">${esc(p.category)}</span>
      ${own ? `<div class="mwrap">
        <button class="dotsbtn" onclick="tmenu('${p.id}',event)">···</button>
        ${mopen ? `<div class="pmenu">
          <button class="mi" onclick="tocol('${p.id}')">⊞&nbsp;${p.col ? 'eliminar de colección' : 'guardar en colección'}</button>
          <button class="mi del" onclick="dpost('${p.id}')">✕&nbsp;eliminar publicación</button>
        </div>` : ''}
      </div>` : ''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn${liked ? ' liked' : ''}" onclick="tlike('${p.id}')">♡ ${likes.length}</button>
      <button class="abtn" onclick="tcmt('${p.id}')">◌ ${cmts.length}</button>
      <button class="abtn${isSaved ? ' sav' : ''}" onclick="tsave('${p.id}')">◈ ${isSaved ? 'guardado' : 'guardar'}</button>
    </div>
    ${copen ? `<div class="csec">
      <div class="crow">
        <input class="cinput" id="${cid}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${p.id}')"/>
        <button class="sendbtn" onclick="scmt('${p.id}')">↑</button>
      </div>
      ${cmts.map(c => `<div class="cm">${avEl({name: c.un, username: c.un})} <div class="cmb"><div class="cma">${esc(c.un)}</div><div class="cmt">${esc(c.txt)}</div></div></div>`).join('')}
    </div>` : ''}
  </div>`;
}

function rprofile() {
  const user = S.puid === S.me.id ? S.me : (S.users.find(x => x.id === S.puid) || { name: 'Usuario', id: S.puid });
  const own = user.id === S.me.id;
  const tab = S.ptab;
  const myp = S.posts.filter(p => p.user_id === user.id);
  const svd = S.posts.filter(p => Array.isArray(p.saved) && p.saved.includes(S.me.id));
  const col = S.posts.filter(p => p.user_id === S.me.id && p.col);

  return `
  <div class="ppage">
    <div class="pavwrap">
      <div class="pav" ${own ? 'onclick="upavatar()"' : ''} style="${own ? 'cursor:pointer' : 'cursor:default'}">
        ${avEl(user, true)}
      </div>
    </div>
    <input type="file" id="avup" accept="image/*" style="display:none" onchange="havatar(event)"/>
    <div class="pinfo">
      <div class="pname">${esc(user.user_metadata?.display_name || user.name || user.email)}</div>
      <div class="pbio">${esc(user.user_metadata?.bio || user.bio || 'sin biografía aún')}</div>
      ${own ? `<button class="editbtn" onclick="openmod()">editar perfil</button>` : ''}
    </div>
    <div class="ptabs">
      <button class="ptab${tab === 'posts' ? ' on' : ''}" onclick="stptab('posts')">publicaciones</button>
      ${own ? `<button class="ptab${tab === 'saved' ? ' on' : ''}" onclick="stptab('saved')">guardados</button>
      <button class="ptab${tab === 'col' ? ' on' : ''}" onclick="stptab('col')">colecciones</button>` : ''}
    </div>
    ${tab === 'posts' ? (myp.length ? myp.map(rpost).join('') : `<div class="empty"><div class="el">aún no hay publicaciones</div></div>`) : ''}
    ${tab === 'saved' ? (svd.length ? svd.map(rpost).join('') : `<div class="empty"><div class="el">aún no guardaste nada</div></div>`) : ''}
    ${tab === 'col' ? (col.length ? col.map(rpost).join('') : `<div class="empty"><div class="el">usa el menú ··· de tus publicaciones para guardar en colecciones</div></div>`) : ''}
  </div>
  ${S.modal ? `<div class="mov" onclick="mclose(event)">
    <div class="mdl">
      <div class="mdlt">editar perfil</div>
      <div class="field"><label>Nombre</label><input id="en" value="${esc(S.me.user_metadata?.display_name || S.me.name)}"/></div>
      <div class="field"><label>Biografía</label><textarea id="eb" placeholder="cuéntanos de ti...">${esc(S.me.user_metadata?.bio || S.me.bio || '')}</textarea></div>
      <div class="macts">
        <button class="cancelbtn" onclick="closemod()">cancelar</button>
        <button class="savebtn" onclick="savemod()">guardar</button>
      </div>
    </div>
  </div>` : ''}`;
}

// --- ACCIONES ---

function setcat(c) { S.cat = c; S.menu = null; render(); }
function stptab(t) { S.ptab = t; render(); }
function tmenu(id, e) { e.stopPropagation(); id = isNaN(id) ? id : Number(id); S.menu = S.menu === id ? null : id; render(); }
document.addEventListener('click', (e) => { 
  if (S.menu && !e.target.closest('.mwrap')) { 
    S.menu = null; 
    render(); 
  } 
});

async function post() {
  const txt = document.getElementById('ct').value.trim();
  const cat = document.getElementById('cc').value;
  if (!txt) return toast('escribe algo primero ✦');
  
  const { error } = await db.from('posts').insert([{ 
    body: txt, 
    category: cat, 
    user_id: S.me.id,
    username: S.me.user_metadata?.display_name || S.me.email
  }]);
  
  if (error) {
    toast('Error: ' + error.message);
  } else { 
    document.getElementById('ct').value = ''; 
    fetchPosts(); 
    toast('publicado en la nube ✦'); 
  }
}

// --- LIKES (persiste en Supabase) ---
async function tlike(id) {
  id = isNaN(id) ? id : Number(id);
  const p = S.posts.find(x => x.id === id); 
  if (!p) return;
  // FIX 2: garantía extra de que sea array antes de modificar
  if (!Array.isArray(p.likes)) p.likes = [];
  const i = p.likes.indexOf(S.me.id);
  if (i > -1) p.likes.splice(i, 1); 
  else p.likes.push(S.me.id);
  
  const { error } = await db.from('posts').update({ likes: p.likes }).eq('id', id);
  if (error) toast('Error al dar like');
  else render(); 
}

// --- GUARDAR (persiste en Supabase) ---
async function tsave(id) {
  id = isNaN(id) ? id : Number(id);
  const p = S.posts.find(x => x.id === id); 
  if (!p) return;
  // FIX 2: garantía extra de que sea array antes de modificar
  if (!Array.isArray(p.saved)) p.saved = [];
  const i = p.saved.indexOf(S.me.id);
  if (i > -1) { p.saved.splice(i, 1); toast('eliminado de guardados'); }
  else { p.saved.push(S.me.id); toast('guardado ◈'); }
  
  const { error } = await db.from('posts').update({ saved: p.saved }).eq('id', id);
  if (error) toast('Error al guardar');
  else render();
}

// --- COLECCIÓN (persiste en Supabase) ---
async function tocol(id) {
  id = isNaN(id) ? id : Number(id);
  const p = S.posts.find(x => x.id === id);
  if (!p) return;
  p.col = !p.col;
  S.menu = null;
  
  const { error } = await db.from('posts').update({ col: p.col }).eq('id', id);
  if (error) toast('Error al actualizar colección');
  else {
    toast(p.col ? 'añadido a colección ⊞' : 'eliminado de colección');
    render();
  }
}

// --- ELIMINAR (persiste en Supabase) ---
async function dpost(id) {
  id = isNaN(id) ? id : Number(id);
  const { error } = await db.from('posts').delete().eq('id', id);
  if (error) {
    toast('Error al eliminar');
  } else {
    S.posts = S.posts.filter(x => x.id !== id);
    S.menu = null;
    toast('publicación eliminada');
    render();
  }
}

// --- COMENTARIOS (persiste en Supabase) ---
function tcmt(id) { id = isNaN(id) ? id : Number(id); S.coOpen[id] = !S.coOpen[id]; render(); }

async function scmt(id) {
  id = isNaN(id) ? id : Number(id);
  // FIX 1: usamos safeId() para buscar el input en el DOM
  const inp = document.getElementById(safeId(id));
  if (!inp) return;
  const txt = inp.value.trim();
  if (!txt) return;
  const p = S.posts.find(x => x.id === id);
  if (!p) return;
  // FIX 2: garantía extra
  if (!Array.isArray(p.cmts)) p.cmts = [];
  
  p.cmts.push({ 
    id: uid(), 
    uid: S.me.id, 
    un: S.me.user_metadata?.display_name || S.me.email, 
    txt, 
    t: Date.now() 
  });
  
  const { error } = await db.from('posts').update({ cmts: p.cmts }).eq('id', id);
  if (error) {
    p.cmts.pop(); // revertir si falla
    toast('Error al comentar');
  } else {
    inp.value = '';
    render();
  }
}

// --- AVATAR ---
function upavatar() { document.getElementById('avup').click(); }
function havatar(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    S.me.av = ev.target.result;
    render(); toast('foto actualizada ✦');
  };
  r.readAsDataURL(f);
}

// --- MODAL PERFIL ---
function openmod() { S.modal = true; render(); }
function closemod() { S.modal = false; render(); }
function mclose(e) { if (e.target === e.currentTarget) closemod(); }

async function savemod() {
  const n = document.getElementById('en').value.trim();
  const b = document.getElementById('eb').value.trim();
  if (!n) return;
  
  const { error } = await db.auth.updateUser({
    data: { display_name: n, bio: b }
  });
  
  if (error) {
    toast('Error al guardar perfil');
  } else {
    S.me.user_metadata.display_name = n;
    S.me.user_metadata.bio = b;
    S.modal = false; 
    render(); 
    toast('perfil actualizado ✦');
  }
}

window.tlike = tlike;
window.tsave = tsave;
window.tcmt = tcmt;
window.scmt = scmt;
window.tocol = tocol;
window.dpost = dpost;
window.tmenu = tmenu;
window.vprof = vprof;
window.post = post;
window.setcat = setcat;
window.stptab = stptab;
window.gofeed = gofeed;
window.goprofile = goprofile;
window.logout = logout;
window.openmod = openmod;
window.closemod = closemod;
window.mclose = mclose;
window.savemod = savemod;
window.upavatar = upavatar;
window.stab = stab;
window.login = login;
window.register = register;

// Verificar sesión al cargar
db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    S.me = session.user;
    boot();
  }
});
