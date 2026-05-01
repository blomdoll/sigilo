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
  menu: null,
  folders: [],
  folderModal: false,
  folderTarget: null,
  folderPostModal: null,
  activeFolderTab: null,
  searchOpen: false
};

const CATS = ['todos', 'decoraciones', 'letras', 'símbolos', 'biografías', 'usernames', 'nombres'];
const uid = () => 'x' + Math.random().toString(36).slice(2);

const ago = ts => {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (isNaN(d)) return '';
  if (d < 60000) return 'ahora';
  if (d < 3600000) return ~~(d / 60000) + 'm';
  if (d < 86400000) return ~~(d / 3600000) + 'h';
  return ~~(d / 86400000) + 'd';
};

const esc = s => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
const safeId = id => 'p' + String(id).replace(/[^a-zA-Z0-9]/g, '_');

function toast(m) { 
  const t = document.getElementById('toast'); 
  if(t) { t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
}

function stab(tab) {
  const lf = document.getElementById('lf'), rf = document.getElementById('rf');
  const tl = document.getElementById('tl'), tr = document.getElementById('tr');
  if (tab === 'login') { lf.style.display='block'; rf.style.display='none'; tl.classList.add('on'); tr.classList.remove('on'); }
  else { lf.style.display='none'; rf.style.display='block'; tr.classList.add('on'); tl.classList.remove('on'); }
}

async function login() {
  const email = document.getElementById('lu').value.trim();
  const password = document.getElementById('lp').value;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) document.getElementById('le').textContent = 'Error: ' + error.message;
  else { S.me = data.user; boot(); }
}

async function register() {
  const email = document.getElementById('re').value.trim();
  const password = document.getElementById('rp').value;
  const username = document.getElementById('ru').value.trim();
  const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: username } } });
  if (error) document.getElementById('ree').textContent = error.message;
  else { toast('¡Cuenta creada! Revisa tu correo de confirmación.'); S.me = data.user; boot(); }
}

function boot() {
  document.getElementById('auth').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex'; app.style.flexDirection = 'column'; app.style.minHeight = '100%';
  fetchPosts();
  fetchFolders();
  gofeed();
}

async function fetchPosts() {
  const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false });
  if (!error) {
    S.posts = data.map(p => ({ ...p, likes: Array.isArray(p.likes)?p.likes:[], cmts: Array.isArray(p.cmts)?p.cmts:[], saved: Array.isArray(p.saved)?p.saved:[], t: p.created_at }));
    render();
  }
}

async function logout() {
  await db.auth.signOut(); S.me = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('lu').value = ''; document.getElementById('lp').value = '';
  stab('login');
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
  toast('carpeta creada ✦'); S.folderModal = false; render();
}

async function renameFolder(id, name) {
  if (!name || !name.trim()) return;
  try { await db.from('folders').update({ name: name.trim() }).eq('id', id); } catch(e) {}
  const f = S.folders.find(x => x.id === id); if (f) f.name = name.trim();
  S.folderModal = false; S.folderTarget = null;
  toast('carpeta renombrada ✦'); render();
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
  S.folderPostModal = null; toast(newFolder ? 'añadido a carpeta ✦' : 'eliminado de carpeta'); render();
}

function openFolderPicker(postId) { S.folderPostModal = isNaN(postId) ? postId : Number(postId); S.menu = null; render(); }
function closeFolderPicker() { S.folderPostModal = null; render(); }
function openCreateFolder() { S.folderModal = 'create'; S.folderTarget = null; render(); }
function openRenameFolder(id) { S.folderModal = 'rename'; S.folderTarget = id; render(); }
function closeFolderForm() { S.folderModal = false; S.folderTarget = null; render(); }
function toggleFolderView(id) { S.activeFolderTab = S.activeFolderTab === id ? null : id; render(); }

// --- BÚSQUEDA ---

function toggleSearch() {
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

async function searchUsers() {
  const q = document.getElementById('searchInput')?.value?.trim();
  const res = document.getElementById('searchResults');
  if (!res) return;
  if (!q) { res.innerHTML = ''; return; }
  const seen = new Set(), matches = [];
  for (const p of S.posts) {
    if (!seen.has(p.user_id)) {
      const name = p.username || '';
      if (name.toLowerCase().includes(q.toLowerCase())) {
        seen.add(p.user_id);
        matches.push({ id: p.user_id, username: name, av: p.author_av });
      }
    }
  }
  if (matches.length === 0) { res.innerHTML = `<div class="s-empty">no se encontraron usuarios</div>`; return; }
  res.innerHTML = matches.slice(0, 8).map(u => `
    <div class="s-row" onclick="goSearchUser('${u.id}')">
      ${u.av ? `<div class="av"><img src="${esc(u.av)}" alt=""/></div>` : `<div class="av">${(u.username[0]||'?').toUpperCase()}</div>`}
      <span class="s-name">${esc(u.username)}</span>
    </div>`).join('');
}

function goSearchUser(id) { toggleSearch(); vprof(id); }

// --- NAVEGACIÓN ---

function gofeed() { S.page='feed'; S.puid=null; S.menu=null; nav(); render(); }
function goprofile() { S.page='profile'; S.puid=S.me.id; S.ptab='posts'; S.menu=null; nav(); render(); }
function vprof(id) { S.page='profile'; S.puid=id; S.ptab='posts'; S.menu=null; nav(); render(); }

function nav() {
  ['nf','np'].forEach(id => { const el=document.getElementById(id); if(el) el.className='nbtn'; });
  const el = document.getElementById(S.page==='feed'?'nf':'np'); if(el) el.className='nbtn on';
}

function avEl(user, big=false) {
  const cls = big ? 'pav' : 'av';
  const name = user?.user_metadata?.display_name||user?.display_name||user?.name||user?.username||user?.email||'?';
  const ini = name.split(' ').map(w=>w[0]).filter(Boolean).join('').toUpperCase().slice(0,2)||'?';
  const avatarUrl = user?.user_metadata?.avatar_url||user?.avatar_url||user?.av||null;
  if (avatarUrl) return `<div class="${cls}"><img src="${esc(avatarUrl)}" alt=""/>${big?'<div class="pavov">cambiar foto</div>':''}</div>`;
  return `<div class="${cls}">${ini}${big?'<div class="pavov">cambiar foto</div>':''}</div>`;
}

function render() {
  const mc = document.getElementById('mc');
  if (mc) mc.innerHTML = S.page==='feed' ? rfeed() : rprofile();
  renderFolderPickerModal();
  renderFolderFormModal();
}

// --- MODALES GLOBALES ---

function renderFolderPickerModal() {
  let el = document.getElementById('folderPickerModal');
  if (!el) { el = document.createElement('div'); el.id='folderPickerModal'; document.body.appendChild(el); }
  if (S.folderPostModal === null) { el.innerHTML=''; return; }
  const post = S.posts.find(x => x.id === S.folderPostModal);
  const myFolders = S.folders.filter(f => f.user_id === S.me.id);
  el.innerHTML = `<div class="mov" onclick="if(event.target===this)closeFolderPicker()">
    <div class="mdl">
      <div class="mdlt">📁 guardar en carpeta</div>
      ${myFolders.length===0
        ? `<div class="empty"><div class="ei">📂</div><div class="el">aún no tienes carpetas.<br/>Crea una desde colecciones.</div></div>`
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
      <div class="mdlt">📁 ${isRename?'renombrar carpeta':'nueva carpeta'}</div>
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

// --- FEED ---

function rfeed() {
  const posts = S.cat==='todos' ? [...S.posts] : S.posts.filter(p=>p.category===S.cat);
  return `
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, símbolos y más ✦</div>
  <div class="ccard">
    <div class="ctop">${avEl(S.me)}<textarea class="ctxt" id="ct" placeholder="comparte algo bonito... ✦"></textarea></div>
    <div class="cbot">
      <select class="csel" id="cc">${CATS.slice(1).map(c=>`<option>${c}</option>`).join('')}</select>
      <button class="pbtn" onclick="post()">publicar ✦</button>
    </div>
  </div>
  <div class="cats">${CATS.map(c=>`<button class="catb${S.cat===c?' on':''}" onclick="setcat('${c}')">${c}</button>`).join('')}</div>
  ${posts.length===0?`<div class="empty"><div class="ei">🌸</div><div class="el">aún no hay publicaciones aquí</div></div>`:posts.map(rpost).join('')}`;
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
  <div class="pcard">
    <div class="phead">
      ${avEl(author)}
      <div style="flex:1">
        <div class="puname" onclick="vprof('${p.user_id}')">${esc(author.username)}</div>
        <div class="ptime">${ago(p.created_at)}</div>
      </div>
      <span class="pbadge">${esc(p.category)}</span>
      ${own?`<div class="mwrap">
        <button class="dotsbtn" onclick="tmenu('${p.id}',event)">···</button>
        ${mopen?`<div class="pmenu">
          <button class="mi" onclick="tocol('${p.id}')">⊞&nbsp;${p.col?'quitar de colección':'guardar en colección'}</button>
          ${p.col?`<button class="mi" onclick="openFolderPicker('${p.id}')">📁&nbsp;${p.folder_id?'mover de carpeta':'poner en carpeta'}</button>`:''}
          <button class="mi del" onclick="dpost('${p.id}')">✕&nbsp;eliminar</button>
        </div>`:''}
      </div>`:''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn${liked?' liked':''}" onclick="tlike('${p.id}')">♡ ${likes.length}</button>
      <button class="abtn" onclick="tcmt('${p.id}')">◌ ${cmts.length}</button>
      <button class="abtn${isSaved?' sav':''}" onclick="tsave('${p.id}')">◈ ${isSaved?'guardado':'guardar'}</button>
    </div>
    ${copen?`<div class="csec">
      <div class="crow">
        <input class="cinput" id="${cid}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${p.id}')"/>
        <button class="sendbtn" onclick="scmt('${p.id}')">↑</button>
      </div>
      ${cmts.map(c=>`<div class="cm">${avEl({name:c.un,username:c.un,avatar_url:c.av||null})}<div class="cmb"><div class="cma">${esc(c.un)}</div><div class="cmt">${esc(c.txt)}</div></div></div>`).join('')}
    </div>`:''}
  </div>`;
}

// --- PERFIL ---

function rprofile() {
  const user = S.puid===S.me.id ? S.me : (S.users.find(x=>x.id===S.puid)||{ name:'Usuario', id:S.puid });
  const own = S.puid===S.me.id;
  const tab = S.ptab;
  const myp = S.posts.filter(p=>p.user_id===S.puid);
  const svd = S.posts.filter(p=>Array.isArray(p.saved)&&p.saved.includes(S.me.id));
  const col = S.posts.filter(p=>p.user_id===S.puid&&p.col);
  const userFolders = S.folders.filter(f=>f.user_id===S.puid);

  return `
  <div class="ppage">
    <div class="pavwrap">
      <div class="pav" ${own?'onclick="upavatar()"':''} style="${own?'cursor:pointer':'cursor:default'}">
        ${avEl(user,true)}
      </div>
    </div>
    <input type="file" id="avup" accept="image/*" style="display:none" onchange="havatar(event)"/>
    <div class="pinfo">
      <div class="pname">${esc(user.user_metadata?.display_name||user.name||user.email)}</div>
      <div class="pbio">${esc(user.user_metadata?.bio||user.bio||'sin biografía aún')}</div>
      ${own?`<button class="editbtn" onclick="openmod()">editar perfil</button>`:''}
    </div>
    <div class="ptabs">
      <button class="ptab${tab==='posts'?' on':''}" onclick="stptab('posts')">publicaciones</button>
      <button class="ptab${tab==='col'?' on':''}" onclick="stptab('col')">colecciones</button>
      ${own?`<button class="ptab${tab==='saved'?' on':''}" onclick="stptab('saved')">guardados</button>`:''}
    </div>
    ${tab==='posts'?(myp.length?myp.map(rpost).join(''):`<div class="empty"><div class="el">aún no hay publicaciones</div></div>`):''}
    ${tab==='saved'?(svd.length?svd.map(rpost).join(''):`<div class="empty"><div class="el">aún no guardaste nada</div></div>`):''}
    ${tab==='col'?renderCollections(userFolders,col,own):''}
  </div>
  ${S.modal?`<div class="mov" onclick="mclose(event)">
    <div class="mdl">
      <div class="mdlt">editar perfil</div>
      <div class="field"><label>Nombre</label><input id="en" value="${esc(S.me.user_metadata?.display_name||S.me.name)}"/></div>
      <div class="field"><label>Biografía</label><textarea id="eb" placeholder="cuéntanos de ti...">${esc(S.me.user_metadata?.bio||S.me.bio||'')}</textarea></div>
      <div class="macts">
        <button class="cancelbtn" onclick="closemod()">cancelar</button>
        <button class="savebtn" onclick="savemod()">guardar</button>
      </div>
    </div>
  </div>`:''}`;
}

function renderCollections(userFolders, col, own) {
  const uncategorized = col.filter(p => !p.folder_id || !userFolders.find(f=>f.id===p.folder_id));
  let html = '';
  if (own) {
    html += `<div class="folder-toolbar"><button class="folder-new-btn" onclick="openCreateFolder()">+ nueva carpeta</button></div>`;
  }
  if (col.length===0 && userFolders.length===0) {
    return html + `<div class="empty"><div class="ei">📂</div><div class="el">${own?'usa el menú ··· de tus publicaciones para guardar en colecciones':'este usuario no tiene colecciones aún'}</div></div>`;
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
            <button class="folder-act-btn del" onclick="if(confirm('¿eliminar la carpeta ${esc(f.name)}?'))deleteFolder('${f.id}')" title="eliminar">✕</button>
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
    html += `<div class="folder-section-label">sin carpeta</div>`;
    html += uncategorized.map(rpost).join('');
  }
  return html;
}

// --- ACCIONES ---

function setcat(c) { S.cat=c; S.menu=null; render(); }
function stptab(t) { S.ptab=t; S.activeFolderTab=null; render(); }
function tmenu(id,e) { e.stopPropagation(); id=isNaN(id)?id:Number(id); S.menu=S.menu===id?null:id; render(); }

document.addEventListener('click', (e) => { 
  if (S.menu && !e.target.closest('.mwrap')) { S.menu=null; render(); }
  if (S.searchOpen && !e.target.closest('#searchOverlay') && !e.target.closest('#ns')) { toggleSearch(); }
});

async function post() {
  const txt = document.getElementById('ct').value.trim();
  const cat = document.getElementById('cc').value;
  if (!txt) return toast('escribe algo primero ✦');
  const { error } = await db.from('posts').insert([{ body:txt, category:cat, user_id:S.me.id, username:S.me.user_metadata?.display_name||S.me.email, author_av:S.me.user_metadata?.avatar_url||null }]);
  if (error) toast('Error: '+error.message);
  else { document.getElementById('ct').value=''; fetchPosts(); toast('publicado en la nube ✦'); }
}

async function tlike(id) {
  id=isNaN(id)?id:Number(id);
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  if(!Array.isArray(p.likes)) p.likes=[];
  const i=p.likes.indexOf(S.me.id);
  if(i>-1) p.likes.splice(i,1); else p.likes.push(S.me.id);
  const {error}=await db.from('posts').update({likes:p.likes}).eq('id',id);
  if(error) toast('Error al dar like'); else render();
}

async function tsave(id) {
  id=isNaN(id)?id:Number(id);
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  if(!Array.isArray(p.saved)) p.saved=[];
  const i=p.saved.indexOf(S.me.id);
  if(i>-1){p.saved.splice(i,1);toast('eliminado de guardados');}else{p.saved.push(S.me.id);toast('guardado ◈');}
  const {error}=await db.from('posts').update({saved:p.saved}).eq('id',id);
  if(error) toast('Error al guardar'); else render();
}

async function tocol(id) {
  id=isNaN(id)?id:Number(id);
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  p.col=!p.col;
  if(!p.col) p.folder_id=null;
  S.menu=null;
  const {error}=await db.from('posts').update({col:p.col,folder_id:p.folder_id||null}).eq('id',id);
  if(error) toast('Error al actualizar colección');
  else { toast(p.col?'añadido a colección ⊞':'eliminado de colección'); render(); }
}

async function dpost(id) {
  id=isNaN(id)?id:Number(id);
  const {error}=await db.from('posts').delete().eq('id',id);
  if(error) toast('Error al eliminar');
  else { S.posts=S.posts.filter(x=>x.id!==id); S.menu=null; toast('publicación eliminada'); render(); }
}

function tcmt(id) { id=isNaN(id)?id:Number(id); S.coOpen[id]=!S.coOpen[id]; render(); }

async function scmt(id) {
  id=isNaN(id)?id:Number(id);
  const inp=document.getElementById(safeId(id)); if(!inp) return;
  const txt=inp.value.trim(); if(!txt) return;
  const p=S.posts.find(x=>x.id===id); if(!p) return;
  if(!Array.isArray(p.cmts)) p.cmts=[];
  p.cmts.push({id:uid(),uid:S.me.id,un:S.me.user_metadata?.display_name||S.me.email,av:S.me.user_metadata?.avatar_url||null,txt,t:Date.now()});
  const {error}=await db.from('posts').update({cmts:p.cmts}).eq('id',id);
  if(error){p.cmts.pop();toast('Error al comentar');}else{inp.value='';render();}
}

function upavatar() { document.getElementById('avup').click(); }

async function havatar(e) {
  const f=e.target.files[0]; if(!f) return;
  toast('subiendo foto...');
  const ext=f.name.split('.').pop(), path=`${S.me.id}.${ext}`;
  const {error:upErr}=await db.storage.from('avatars').upload(path,f,{upsert:true,contentType:f.type});
  if(upErr){toast('Error al subir imagen');return;}
  const {data}=db.storage.from('avatars').getPublicUrl(path);
  const url=data.publicUrl;
  const {error:authErr}=await db.auth.updateUser({data:{avatar_url:url}});
  if(authErr){toast('Error al guardar avatar');return;}
  S.me.user_metadata.avatar_url=url; render(); toast('foto actualizada ✦');
}

function openmod(){S.modal=true;render();}
function closemod(){S.modal=false;render();}
function mclose(e){if(e.target===e.currentTarget)closemod();}

async function savemod() {
  const n=document.getElementById('en').value.trim(), b=document.getElementById('eb').value.trim();
  if(!n) return;
  const {error}=await db.auth.updateUser({data:{display_name:n,bio:b}});
  if(error) toast('Error al guardar perfil');
  else { S.me.user_metadata.display_name=n; S.me.user_metadata.bio=b; S.modal=false; render(); toast('perfil actualizado ✦'); }
}

// --- EXPOSE ---
window.tlike=tlike; window.tsave=tsave; window.tcmt=tcmt; window.scmt=scmt;
window.tocol=tocol; window.dpost=dpost; window.tmenu=tmenu; window.vprof=vprof;
window.post=post; window.setcat=setcat; window.stptab=stptab;
window.gofeed=gofeed; window.goprofile=goprofile; window.logout=logout;
window.openmod=openmod; window.closemod=closemod; window.mclose=mclose; window.savemod=savemod;
window.upavatar=upavatar; window.stab=stab; window.login=login; window.register=register;
window.openCreateFolder=openCreateFolder; window.openRenameFolder=openRenameFolder;
window.closeFolderForm=closeFolderForm; window.createFolder=createFolder;
window.renameFolder=renameFolder; window.deleteFolder=deleteFolder;
window.assignToFolder=assignToFolder; window.openFolderPicker=openFolderPicker;
window.closeFolderPicker=closeFolderPicker; window.toggleFolderView=toggleFolderView;
window.toggleSearch=toggleSearch; window.searchUsers=searchUsers; window.goSearchUser=goSearchUser;
window.havatar=havatar;

db.auth.getSession().then(({data:{session}})=>{
  if(session){S.me=session.user;boot();}
});
