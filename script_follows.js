// db es el mismo Proxy definido en script.js — accede a window.db cuando esté listo
// No redefinir aquí, simplemente heredar el `db` global del scope de script.js

S.followTab        = S.followTab || 'todos';
S.followingIds     = new Set();
S.followersOfMe    = null;  
S.followingPosts   = [];
S.followingLoaded  = false;
S.followListModal  = null;
S.profileCounts    = {};

// ------------------
// INICIALIZACIÓN
// ------------------
async function loadFollowingIds() {
  if (!S.me) return;
  try {
    const { data, error } = await db
      .from('follows')
      .select('following_id')
      .eq('follower_id', S.me.id);
    if (!error && data) {
      S.followingIds = new Set(data.map(r => r.following_id));
    }
  } catch(e) { S.followingIds = new Set(); }
}

// ---------------------
// FOLLOW / UNFOLLOW
// ---------------------
async function followUser(uid) {
  if (!S.me || uid === S.me.id) return;
  const btn = document.querySelector('.follow-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  const { error } = await db.from('follows').insert([{
    follower_id:  S.me.id,
    following_id: uid,
  }]);

  if (!error) {
    S.followingIds.add(uid);
    const myName = S.me.user_metadata?.display_name || S.me.email;
    try {
      await db.from('notifications').insert([{
        to_uid: uid, from_uid: S.me.id, from_name: myName,
        type: 'follow', post_id: null, post_body: null, read: false,
      }]);
    } catch(e) {}
    toast('siguiendo \u2756');
    // Invalidar cache de ambos perfiles (el seguido Y el mio propio)
    delete S.profileCounts[uid];
    delete S.profileCounts[S.me.id];
    S.followingLoaded = false;
  } else {
    toast('Error al seguir');
  }

  renderProfileFollowState(uid);
}

async function unfollowUser(uid) {
  if (!S.me || uid === S.me.id) return;
  const btn = document.querySelector('.follow-btn');
  if (btn) { btn.disabled = true; }

  const { error } = await db.from('follows').delete()
    .eq('follower_id', S.me.id)
    .eq('following_id', uid);

  if (!error) {
    S.followingIds.delete(uid);
    toast('dejaste de seguir');
    delete S.profileCounts[uid];
    delete S.profileCounts[S.me.id];
    S.followingLoaded = false;
    S.followingPosts = S.followingPosts.filter(p => p.user_id !== uid);
  } else {
    toast('Error al dejar de seguir');
  }

  renderProfileFollowState(uid);
}

// ----------------------------------------------------------------
// RENDERIZAR BOTON + CONTADORES (actualizacion parcial del DOM)
// ----------------------------------------------------------------
function renderProfileFollowState(uid) {
  const wrap = document.getElementById('follow-btn-wrap');
  if (wrap) {
    wrap.innerHTML = renderFollowBtn(uid, S.followingIds.has(uid));
  }
  loadProfileCounts(uid).then(() => {
    const safeUid = uid.replace(/-/g,'_');
    const countsEl = document.getElementById('follow-counts-' + safeUid);
    if (countsEl) countsEl.outerHTML = renderFollowCounts(uid);
  });
}

function renderFollowBtn(uid, isFollowing) {
  if (uid === S.me?.id) return '';
  return `<button class="follow-btn${isFollowing ? ' following' : ''}"
    onclick="${isFollowing ? `unfollowUser('${uid}')` : `followUser('${uid}')`}">
    ${isFollowing ? '\u2713 siguiendo' : '+ seguir'}
  </button>`;
}

function renderFollowCounts(uid) {
  const counts = S.profileCounts[uid] || { followers: 0, following: 0 };
  const safeUid = uid.replace(/-/g,'_');
  return `<div class="follow-counts" id="follow-counts-${safeUid}">
    <div class="follow-count-item" onclick="openFollowList('${uid}','followers')">
      <span class="follow-count-num">${counts.followers}</span>
      <span class="follow-count-label">seguidores</span>
    </div>
    <div class="follow-count-item" onclick="openFollowList('${uid}','following')">
      <span class="follow-count-num">${counts.following}</span>
      <span class="follow-count-label">siguiendo</span>
    </div>
  </div>`;
}

async function loadProfileCounts(uid) {
  if (S.profileCounts[uid]) return;
  try {
    const { data } = await db.from('profiles')
      .select('followers_count, following_count')
      .eq('id', uid)
      .single();
    if (data) {
      S.profileCounts[uid] = {
        followers: data.followers_count || 0,
        following: data.following_count || 0,
      };
      return;
    }
  } catch(e) { /* columnas aun no existen, usar fallback */ }

  // Fallback: contar directo desde la tabla follows
  try {
    const [resA, resB] = await Promise.all([
      db.from('follows').select('id', { count:'exact', head:true }).eq('following_id', uid),
      db.from('follows').select('id', { count:'exact', head:true }).eq('follower_id',  uid),
    ]);
    S.profileCounts[uid] = {
      followers: resA.count || 0,
      following: resB.count || 0,
    };
  } catch(e2) {
    S.profileCounts[uid] = { followers: 0, following: 0 };
  }
}

// ----------------------------------------------------------------
// LISTA DE SEGUIDORES / SIGUIENDO (modal)
// ----------------------------------------------------------------
async function openFollowList(uid, type) {
  S.followListModal = { uid, type, title: type === 'followers' ? 'seguidores' : 'siguiendo', list: null, profileUid: uid };
  renderFollowListModal();

  // Cargar quiénes me siguen a mí (para mostrar "te sigue" / "no te sigue")
  if (!S.followersOfMe && S.me) {
    try {
      const { data } = await db.from('follows')
        .select('follower_id')
        .eq('following_id', S.me.id);
      S.followersOfMe = new Set((data || []).map(r => r.follower_id));
    } catch(e) {
      S.followersOfMe = new Set();
    }
  }

  try {
    // Intentar join directo (sin nombre de FK hardcodeado)
    let data;
    if (type === 'followers') {
      const res = await db.from('follows')
        .select('follower_id, profiles(id, username, display_name, avatar_url)')
        .eq('following_id', uid);
      if (!res.error && res.data) {
        data = res.data.map(r => r.profiles).filter(Boolean);
      }
    } else {
      const res = await db.from('follows')
        .select('following_id, profiles(id, username, display_name, avatar_url)')
        .eq('follower_id', uid);
      if (!res.error && res.data) {
        data = res.data.map(r => r.profiles).filter(Boolean);
      }
    }

    // Si el join funcionó, usar esos datos
    if (data) {
      S.followListModal.list = data;
      renderFollowListModal();
      return;
    }
  } catch(e) { /* continuar al fallback */ }

  // Fallback confiable: dos queries separados
  try {
    const idCol    = type === 'followers' ? 'follower_id'  : 'following_id';
    const filterCol = type === 'followers' ? 'following_id' : 'follower_id';
    const { data: followData, error: e1 } = await db
      .from('follows')
      .select(idCol)
      .eq(filterCol, uid);

    if (e1 || !followData) {
      S.followListModal.list = [];
      renderFollowListModal();
      return;
    }

    const ids = followData.map(r => r[idCol]).filter(Boolean);
    if (ids.length === 0) {
      S.followListModal.list = [];
      renderFollowListModal();
      return;
    }

    const { data: profileData } = await db
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);

    S.followListModal.list = profileData || [];
  } catch(e2) {
    S.followListModal.list = [];
  }

  renderFollowListModal();
}

function closeFollowList() {
  S.followListModal = null;
  const el = document.getElementById('followListModal');
  if (el) el.innerHTML = '';
}

function renderFollowListModal() {
  let el = document.getElementById('followListModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'followListModal';
    document.body.appendChild(el);
  }
  if (!S.followListModal) { el.innerHTML = ''; return; }

  const { title, list, type } = S.followListModal;
  const loading = list === null;

  let bodyHtml;
  if (loading) {
    bodyHtml = `<div class="follow-list-empty">cargando...</div>`;
  } else if (list.length === 0) {
    bodyHtml = `<div class="follow-list-empty">aún no hay ${title} aquí</div>`;
  } else {
    bodyHtml = list.map(u => {
      if (!u || !u.id) return '';
      const name = u.display_name || u.username || '?';
      const isSelf = u.id === S.me?.id;
      const iFollow = S.followingIds.has(u.id);          // yo sigo a esta persona
      const theyFollowMe = S.followersOfMe && S.followersOfMe.has(u.id); // esta persona me sigue

      // Etiqueta "te sigue" solo visible en tab seguidores (siempre cierta allí)
      // En tab siguiendo, mostrar "te sigue" si aplica
      const mutualTag = theyFollowMe
        ? `<span class="fl-mutual-tag">te sigue</span>`
        : (type === 'followers' ? '' : `<span class="fl-mutual-tag fl-mutual-no">no te sigue</span>`);

      // Botón seguir/dejar de seguir (no mostrar para uno mismo)
      let actionBtn = '';
      if (!isSelf) {
        if (iFollow) {
          actionBtn = `<button class="fl-follow-btn fl-following" onclick="flToggleFollow(event,'${u.id}',false)">siguiendo</button>`;
        } else {
          actionBtn = `<button class="fl-follow-btn" onclick="flToggleFollow(event,'${u.id}',true)">+ seguir</button>`;
        }
      }

      return `<div class="follow-list-row">
        <div onclick="closeFollowList();vprof('${u.id}')" style="display:flex;align-items:center;gap:.85rem;flex:1;min-width:0;cursor:pointer;">
          ${u.avatar_url
            ? `<div class="av"><img src="${esc(u.avatar_url)}" alt=""/></div>`
            : `<div class="av">${(name[0]||'?').toUpperCase()}</div>`}
          <div class="fl-name-block">
            <span class="follow-list-name">${esc(name)}</span>
            ${mutualTag}
          </div>
        </div>
        ${actionBtn}
      </div>`;
    }).join('');
  }

  el.innerHTML = `<div class="follow-list-panel" onclick="if(event.target===this)closeFollowList()">
    <div class="follow-list-box">
      <div class="follow-list-head">
        <span class="follow-list-title">${title}</span>
        <button class="follow-list-close" onclick="closeFollowList()">\u2715</button>
      </div>
      <div class="follow-list-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// Seguir/dejar de seguir desde dentro del modal sin cerrarlo
async function flToggleFollow(evt, uid, doFollow) {
  evt.stopPropagation();
  const btn = evt.currentTarget;
  btn.disabled = true;
  btn.textContent = '...';

  if (doFollow) {
    const { error } = await db.from('follows').insert([{ follower_id: S.me.id, following_id: uid }]);
    if (!error) {
      S.followingIds.add(uid);
      const myName = S.me.user_metadata?.display_name || S.me.email;
      try {
        await db.from('notifications').insert([{
          to_uid: uid, from_uid: S.me.id, from_name: myName,
          type: 'follow', post_id: null, post_body: null, read: false,
        }]);
      } catch(e) {}
      delete S.profileCounts[uid];
      delete S.profileCounts[S.me.id];
      S.followingLoaded = false;
      toast('siguiendo \u2756');
    } else {
      toast('error al seguir');
    }
  } else {
    const { error } = await db.from('follows').delete()
      .eq('follower_id', S.me.id).eq('following_id', uid);
    if (!error) {
      S.followingIds.delete(uid);
      delete S.profileCounts[uid];
      delete S.profileCounts[S.me.id];
      S.followingLoaded = false;
      S.followingPosts = S.followingPosts.filter(p => p.user_id !== uid);
      toast('dejaste de seguir');
    } else {
      toast('error al dejar de seguir');
    }
  }

  // Re-renderizar solo el botón afectado sin cerrar el modal
  renderFollowListModal();

  // Actualizar contadores en el perfil si está visible
  if (S.puid) {
    loadProfileCounts(S.puid).then(() => {
      const safeUid = S.puid.replace(/-/g,'_');
      const countsEl = document.getElementById('follow-counts-' + safeUid);
      if (countsEl) countsEl.outerHTML = renderFollowCounts(S.puid);
    });
  }
}
window.flToggleFollow = flToggleFollow;

// ----------------------------------------------------------------
// FEED "SIGUIENDO"
// ----------------------------------------------------------------
async function fetchFollowingFeed() {
  if (S.followingIds.size === 0) {
    S.followingPosts = [];
    renderFeedFollowing();
    return;
  }

  try {
    const { data, error } = await db
      .from('posts')
      .select('*')
      .in('user_id', [...S.followingIds])
      .order('created_at', { ascending: false })
      .range(0, 29);

    if (!error && data) {
      S.followingPosts = data.map(p => ({
        ...p,
        likes: Array.isArray(p.likes) ? p.likes : [],
        cmts:  Array.isArray(p.cmts)  ? p.cmts  : [],
        saved: Array.isArray(p.saved) ? p.saved : [],
        t: p.created_at,
      }));
      S.followingLoaded = true;

      // Batch-fetch perfiles de autores no cacheados para tener avatares frescos
      const unknownAuthorIds = [...new Set(
        S.followingPosts
          .map(p => p.user_id)
          .filter(uid => uid !== S.me.id && !S.users.find(u => u.id === uid))
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
              const profile = {
                id: d.id, username: d.display_name || d.username,
                display_name: d.display_name || d.username,
                avatar_url: avatarUrl, bio: d.bio || '', _ts: Date.now()
              };
              const existing = S.users.findIndex(u => u.id === d.id);
              if (existing > -1) S.users[existing] = profile; else S.users.push(profile);
            }));
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    S.followingPosts = [];
  }

  renderFeedFollowing();
}

// ----------------------------------------------------------------
// RENDER DEL FEED CON TABS
// ----------------------------------------------------------------
function rfeedWithTabs() {
  const composeCat = S.composeCat || CATS[1];
  const activeTab = S.followTab || S.feedTab || 'todos';

  const composeCard = `
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
  </div>`;

  const header = `
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, símbolos y más</div>`;

  const tabs = `
  <div class="explore-banner" onclick="goExplore()">
    <div class="explore-banner-icon"><i class="fi fi-rr-star"></i></div>
    <div class="explore-banner-text">
      <div class="explore-banner-title">explorar destacados</div>
      <div class="explore-banner-sub">publicaciones populares de las últimas 48 horas</div>
    </div>
    <div class="explore-banner-arrow"><i class="fi fi-rr-angle-right"></i></div>
  </div>
  <div class="feed-tabs">
    <button class="feed-tab${activeTab!=='siguiendo'&&activeTab!=='explorar'&&activeTab!=='comunidad'?' on':''}" onclick="setFeedTab('todos')">\u2756 todos</button>
    <button class="feed-tab${activeTab==='comunidad'?' on':''}" onclick="setFeedTab('comunidad')">comunidad</button>
    <button class="feed-tab${activeTab==='siguiendo'?' on':''}" onclick="setFeedTab('siguiendo')">siguiendo</button>
  </div>`;

  if (activeTab === 'siguiendo') {
    return header + composeCard + tabs + renderFollowingSection();
  }

  if (activeTab === 'comunidad') {
    return header + composeCard + tabs + rCommunitySection();
  }

  // Tab "todos" (default)
  const posts = S.cat==='todos' ? [...S.posts] : S.posts.filter(p=>p.category===S.cat);
  const catsAndPosts = `
    <div class="cats">${CATS.map(c=>`<button class="catb${S.cat===c?' on':''}" onclick="setcat('${c}')">${c}</button>`).join('')}</div>
    ${posts.length===0
      ? `<div class="empty"><div class="ei">\ud83c\udf38</div><div class="el">todavía no hay publicaciones aquí \u2014 sé el primero \u2756</div></div>`
      : posts.map(rpost).join('') + `<div id="scroll-sentinel" style="height:1px;margin:1rem 0"></div>`
    }`;

  return header + composeCard + tabs + catsAndPosts;
}

function renderFollowingSection() {
  if (S.followingIds.size === 0) {
    return `<div class="feed-following-empty">
      <div class="fi-icon">\ud83c\udf3f</div>
      <div>aún no sigues a nadie.</div>
      <div style="margin-top:.5rem">busca usuarios con el ícono \ud83d\udd0d o visita perfiles para seguirlos.</div>
    </div>`;
  }
  if (!S.followingLoaded) {
    const sk = `<div class="skeleton-card"><div class="sk-head"><div class="sk-line sk-avatar"></div><div class="sk-meta"><div class="sk-line short"></div><div class="sk-line tiny"></div></div></div><div class="sk-line full"></div><div class="sk-line med"></div></div>`;
    return sk.repeat(3);
  }
  if (S.followingPosts.length === 0) {
    return `<div class="feed-following-empty">
      <div class="fi-icon">\ud83d\udceb</div>
      <div>las personas que sigues no han publicado nada todavía.</div>
    </div>`;
  }
  return S.followingPosts.map(rpost).join('');
}

function renderFeedFollowing() {
  if (S.page !== 'feed' || S.followTab !== 'siguiendo') return;
  const mc = document.getElementById('mc');
  if (!mc) return;
  mc.innerHTML = rfeedWithTabs();
  attachTextareaResize();
}

// ----------------------------------------------------------------
// TAB SWITCH
// ----------------------------------------------------------------
function setFeedTab(tab) {
  S.followTab = tab;
  S.feedTab = tab; // mantener ambos en sync (script.js usa feedTab, script_follows usa followTab)

  if (tab === 'explorar') {
    goExplore();
    return;
  }

  if (tab === 'comunidad') {
    render();
    if (S.communityPosts.length === 0) {
      fetchCommunityPosts().then(() => {
        if (S.feedTab === 'comunidad') render();
      });
    }
    return;
  }

  if (tab === 'siguiendo' && !S.followingLoaded) {
    fetchFollowingFeed();
  } else {
    render();
  }
}

// ----------------------------------------------------------------
// HELPER: inyectar HTML despues de .pbio usando DOM (sin regex fragil)
// ----------------------------------------------------------------
function injectAfterBio(html, insertHtml) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const bio = tmp.querySelector('.pbio');
  if (bio) {
    const frag = document.createElement('div');
    frag.innerHTML = insertHtml;
    // Insertar nodos en orden despues de .pbio
    let ref = bio;
    while (frag.firstChild) {
      ref.parentNode.insertBefore(frag.firstChild, ref.nextSibling);
      ref = ref.nextSibling;
    }
  }
  return tmp.innerHTML;
}

// ----------------------------------------------------------------
// PATCH: rprofile
// Muestra contadores en perfil propio Y ajeno.
// Muestra boton seguir solo en perfiles ajenos.
// ----------------------------------------------------------------
const _origRprofile = rprofile;
window.rprofile = function() {
  let html = _origRprofile();

  const uid = S.puid;
  const own = uid === S.me?.id;

  // Cargar contadores en background si no estan en cache
  if (!S.profileCounts[uid]) {
    loadProfileCounts(uid).then(() => {
      const safeUid = uid.replace(/-/g,'_');
      const countsEl = document.getElementById('follow-counts-' + safeUid);
      if (countsEl) countsEl.outerHTML = renderFollowCounts(uid);
    });
  }

  // Siempre mostrar contadores. Boton seguir solo en ajenos.
  const isFollowing = !own && S.followingIds.has(uid);
  const followHtml = `${renderFollowCounts(uid)}${own ? '' : `<div id="follow-btn-wrap">${renderFollowBtn(uid, isFollowing)}</div>`}`;

  html = injectAfterBio(html, followHtml);
  return html;
};

// ----------------------------------------------------------------
// PATCH: rfeed — tabs
// ----------------------------------------------------------------
const _origRfeed = rfeed;
window.rfeed = function() {
  if (S.page === 'settings') return rsettings();
  return rfeedWithTabs();
};

// ----------------------------------------------------------------
// PATCH: render — incluir renderFollowListModal
// ----------------------------------------------------------------
const _origRenderForFollows = render;
window.render = function() {
  _origRenderForFollows();
  renderFollowListModal();
};

// ----------------------------------------------------------------
// PATCH: renderNotifPanel — notif de nuevo seguidor
// ----------------------------------------------------------------
const _origRenderNotifPanel = renderNotifPanel;
window.renderNotifPanel = function() {
  let el = document.getElementById('notifPanel');
  if (!el) { el = document.createElement('div'); el.id = 'notifPanel'; document.body.appendChild(el); }
  if (!S.notifOpen) {
    el.innerHTML = '';
    const _bd = document.getElementById('notifBackdrop');
    if (_bd) _bd.style.display = 'none';
    return;
  }
  let bd = document.getElementById('notifBackdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'notifBackdrop';
    bd.style.cssText = 'position:fixed;inset:0;z-index:89;display:none;';
    bd.addEventListener('click', () => { S.notifOpen = false; renderNotifPanel(); });
    document.body.appendChild(bd);
  }
  bd.style.display = 'block';

  const items = S.notifs.length === 0
    ? `<div class="s-empty" style="padding:1.2rem .6rem">sin notificaciones aún</div>`
    : S.notifs.slice(0, 20).map(n => {
        let icon = '\u2661', text = ' le dio like a tu publicación';
        if (n.type === 'comment') { icon = '\u25cc'; text = ' comentó en tu publicación'; }
        if (n.type === 'follow')  { icon = '\u2756'; text = ' empez\u00f3 a seguirte'; }
        const onclick = n.type === 'follow'
          ? `S.notifOpen=false;renderNotifPanel();vprof('${n.fromUid}')`
          : `goNotif('${n.postId}')`;
        return `<div class="notif-row" onclick="${onclick}">
          <span class="notif-icon">${icon}</span>
          <div class="notif-body">
            <span class="notif-name">${esc(n.fromName)}</span>${text}
            ${n.postBody && n.type !== 'follow' ? `<div class="notif-preview">${esc(n.postBody)}</div>` : ''}
          </div>
          <span class="notif-time" data-ts="${n.ts}">${ago(n.ts)}</span>
        </div>`;
      }).join('');

  el.innerHTML = `<div class="notif-panel">
    <div class="notif-head">
      <span>notificaciones</span>
      ${S.notifs.length > 0 ? `<button class="notif-clear" onclick="clearNotifs()">limpiar</button>` : ''}
    </div>
    ${items}
  </div>`;
};

// ----------------------------------------------------------------
// INICIALIZAR al hacer boot
// ----------------------------------------------------------------
const _origBoot = boot;
window.boot = function() {
  _origBoot();
  loadFollowingIds();
};

// Resetear followTab junto con feedTab cuando se va al feed
const _origGofeedFollows = gofeed;
window.gofeed = function() {
  S.followTab = 'todos';
  _origGofeedFollows();
};

// ----------------------------------------------------------------
// EXPOSE
// ----------------------------------------------------------------
window.followUser            = followUser;
window.unfollowUser          = unfollowUser;
window.setFeedTab            = setFeedTab;
window.openFollowList        = openFollowList;
window.closeFollowList       = closeFollowList;
window.renderFollowListModal = renderFollowListModal;
window.loadFollowingIds      = loadFollowingIds;
window.fetchFollowingFeed    = fetchFollowingFeed;
