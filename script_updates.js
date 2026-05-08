// ================================================================
// SIGILO — script_updates.js
// Panel de "Actualizaciones" — edita UPDATES para agregar cambios
// ================================================================

// ----------------------------------------------------------------
// ✏️  EDITA AQUÍ para agregar nuevas actualizaciones
//    Agrega al inicio del array (más reciente primero)
// ----------------------------------------------------------------
const UPDATES = [
  {
    version: '1.3',
    date: '2025-05',
    label: 'mayo 2025',
    items: [
      { icon: '✦', text: 'Panel de actualizaciones — ahora puedes ver los cambios recientes de sigilo.' },
      { icon: '✦', text: 'Seguidores mejorados — en la lista de seguidores/siguiendo ahora se muestra quién te sigue de vuelta, con botón para seguirles directamente.' },
    ]
  },
  {
    version: '1.2',
    date: '2025-04',
    label: 'abril 2025',
    items: [
      { icon: '✦', text: 'Sistema de seguir/dejar de seguir con notificaciones en tiempo real.' },
      { icon: '✦', text: 'Feed "Siguiendo" — tab exclusiva con publicaciones de las cuentas que sigues.' },
      { icon: '✦', text: 'Likes en comentarios — reacciona a comentarios con corazón.' },
      { icon: '✦', text: 'Posts anclados — ancla un post favorito en la parte superior de tu perfil.' },
    ]
  },
  {
    version: '1.1',
    date: '2025-03',
    label: 'marzo 2025',
    items: [
      { icon: '✦', text: 'Explorar — descubre los posts más destacados de la comunidad.' },
      { icon: '✦', text: 'Carpetas — organiza tus posts guardados en colecciones.' },
      { icon: '✦', text: 'Temas de color — elige entre 8 paletas para personalizar tu experiencia.' },
      { icon: '✦', text: 'Chat global — habla con la comunidad en tiempo real.' },
    ]
  },
  {
    version: '1.0',
    date: '2025-02',
    label: 'febrero 2025',
    items: [
      { icon: '✦', text: 'Lanzamiento de sigilo — bienvenida a la comunidad de arte en texto.' },
      { icon: '✦', text: 'Publicaciones con categorías: decoraciones, letras, símbolos, biografías y más.' },
      { icon: '✦', text: 'Likes, comentarios y guardados en cada publicación.' },
      { icon: '✦', text: 'Perfiles de usuario con avatar y bio.' },
    ]
  },
];

// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
S.updatesOpen = false;

// ----------------------------------------------------------------
// CLAVE LOCAL — para marcar si hay novedades no vistas
// ----------------------------------------------------------------
const UPDATES_KEY = 'sigilo_updates_seen';
const LATEST_VERSION = UPDATES[0]?.version || '1.0';

function _getSeenVersion() {
  try { return localStorage.getItem(UPDATES_KEY) || ''; } catch(e) { return ''; }
}
function _markSeen() {
  try { localStorage.setItem(UPDATES_KEY, LATEST_VERSION); } catch(e) {}
}
function _hasUnseenUpdates() {
  return _getSeenVersion() !== LATEST_VERSION;
}

// ----------------------------------------------------------------
// ABRIR / CERRAR
// ----------------------------------------------------------------
function openUpdates() {
  S.updatesOpen = true;
  _markSeen();
  _renderUpdatesBadges(); // quitar badges
  _renderUpdatesPanel();
}

function closeUpdates() {
  S.updatesOpen = false;
  const el = document.getElementById('updatesPanel');
  if (el) el.innerHTML = '';
}

// ----------------------------------------------------------------
// RENDER DEL PANEL
// ----------------------------------------------------------------
function _renderUpdatesPanel() {
  let el = document.getElementById('updatesPanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'updatesPanel';
    document.body.appendChild(el);
  }

  const itemsHtml = UPDATES.map((u, i) => `
    <div class="upd-group${i === 0 ? ' upd-group-latest' : ''}">
      <div class="upd-group-head">
        <span class="upd-version">v${u.version}</span>
        <span class="upd-date">${u.label}</span>
        ${i === 0 ? `<span class="upd-new-badge">nuevo</span>` : ''}
      </div>
      <ul class="upd-list">
        ${u.items.map(it => `
          <li class="upd-item">
            <span class="upd-icon">${it.icon}</span>
            <span class="upd-text">${it.text}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="upd-backdrop" onclick="closeUpdates()"></div>
    <aside class="upd-panel">
      <div class="upd-head">
        <div class="upd-head-left">
          <span class="upd-head-icon">✦</span>
          <span class="upd-head-title">actualizaciones</span>
        </div>
        <button class="upd-close" onclick="closeUpdates()" aria-label="Cerrar">✕</button>
      </div>
      <div class="upd-sub">cambios recientes en sigilo</div>
      <div class="upd-body">${itemsHtml}</div>
    </aside>
  `;
}

// ----------------------------------------------------------------
// BOTÓN ESCRITORIO — inyectado en el área lateral izquierda
// Se llama desde boot y cuando render() se ejecuta
// ----------------------------------------------------------------
function _injectDesktopUpdatesBtn() {
  if (window.innerWidth <= 640) return;
  if (document.getElementById('updates-desktop-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'updates-desktop-btn';
  btn.className = 'upd-desktop-btn';
  btn.title = 'Actualizaciones';
  btn.onclick = openUpdates;
  btn.innerHTML = `
    <span class="upd-desktop-icon">✦</span>
    <span class="upd-desktop-label">actualizaciones</span>
    <span id="upd-desktop-dot" class="upd-dot" style="display:none"></span>
  `;

  // Insertar como hijo del body — posicionado fixed via CSS
  document.body.appendChild(btn);
  _renderUpdatesBadges();
}

// ----------------------------------------------------------------
// BADGES (punto rojo en botón y en header móvil)
// ----------------------------------------------------------------
function _renderUpdatesBadges() {
  const hasNew = _hasUnseenUpdates();

  // Badge escritorio
  const desktopDot = document.getElementById('upd-desktop-dot');
  if (desktopDot) desktopDot.style.display = hasNew ? 'inline-block' : 'none';

  // Badge móvil (en el botón del header)
  const mobDot = document.getElementById('upd-mob-dot');
  if (mobDot) mobDot.style.display = hasNew ? 'inline-block' : 'none';
}

// ----------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------
const _origBootForUpdates = boot;
window.boot = function() {
  _origBootForUpdates();
  setTimeout(() => {
    _injectDesktopUpdatesBtn();
    _renderUpdatesBadges();
  }, 200);
};

// También re-intentar al hacer render (por si el DOM se reconstruye)
const _origRenderForUpdates = render;
window.render = function() {
  _origRenderForUpdates();
  setTimeout(() => {
    _injectDesktopUpdatesBtn();
    _renderUpdatesBadges();
  }, 100);
};

// ----------------------------------------------------------------
// EXPOSE
// ----------------------------------------------------------------
window.openUpdates  = openUpdates;
window.closeUpdates = closeUpdates;
