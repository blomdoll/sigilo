const UPDATES = [
  {
    version: '1.1',
    date: '2026-05',
    label: 'mayo 2026',
    items: [
      { icon: '✦', text: 'Panel de actualizaciones — ahora puedes ver los cambios recientes de sigilo.' },
      { icon: '✦', text: 'Seguidores mejorados — en la lista de seguidores/siguiendo ahora se muestra quién te sigue de vuelta, con botón para seguirles directamente.' },
    ]
  },
  {
    version: '1.0',
    date: '2026-05',
    label: 'mayo 2026',
    items: [
      { icon: '✦', text: 'Sistema de seguir/dejar de seguir con notificaciones en tiempo real.' },
      { icon: '✦', text: 'Feed "Siguiendo" — tab exclusiva con publicaciones de las cuentas que sigues.' },
      { icon: '✦', text: 'Likes en comentarios — reacciona a comentarios con corazón.' },
      { icon: '✦', text: 'Posts anclados — ancla un post favorito en la parte superior de tu perfil.' },
    ]
  },
  {

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
// ABRIR — siempre funciona, sin depender de patches de boot/render
// ----------------------------------------------------------------
function openUpdates() {
  S.updatesOpen = true;
  _markSeen();
  _renderUpdatesPanel();   // panel primero
  _syncAllBadges();        // luego quitar badges
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
// BOTÓN ESCRITORIO
// Se inyecta una sola vez en el body (fixed por CSS).
// NO depende de render() — sobrevive a cualquier re-render de #mc.
// ----------------------------------------------------------------
function _ensureDesktopBtn() {
  if (window.innerWidth <= 640) return;
  // Verificar que realmente sigue en el DOM (no solo en memoria)
  if (document.body.contains(document.getElementById('updates-desktop-btn'))) return;

  const btn = document.createElement('button');
  btn.id = 'updates-desktop-btn';
  btn.className = 'upd-desktop-btn';
  btn.title = 'Actualizaciones';
  btn.setAttribute('aria-label', 'Actualizaciones');
  btn.onclick = openUpdates;
  btn.innerHTML = `
    <span class="upd-desktop-icon">✦</span>
    <span class="upd-desktop-label">actualizaciones</span>
    <span class="upd-desktop-dot upd-dot"></span>
  `;
  document.body.appendChild(btn);
}

// ----------------------------------------------------------------
// SINCRONIZAR BADGES — punto rojo en escritorio Y móvil
// ----------------------------------------------------------------
function _syncAllBadges() {
  const hasNew = _hasUnseenUpdates();

  // Badge escritorio (span con clase dentro del botón)
  const desktopDot = document.querySelector('#updates-desktop-btn .upd-desktop-dot');
  if (desktopDot) {
    desktopDot.style.display = hasNew ? 'block' : 'none';
  }

  // Badge móvil (span con id en el header HTML)
  const mobDot = document.getElementById('upd-mob-dot');
  if (mobDot) {
    // Forzar display aunque el padre tenga overflow hidden o display:none
    mobDot.style.setProperty('display', hasNew ? 'block' : 'none', 'important');
  }
}

// ----------------------------------------------------------------
// INICIALIZACIÓN — segura, no depende de boot() ni render()
// ----------------------------------------------------------------
function _updatesInit() {
  _ensureDesktopBtn();
  _syncAllBadges();

  window.addEventListener('resize', () => {
    _ensureDesktopBtn();
    _syncAllBadges();
  });
}

// Ejecutar tan pronto como el DOM esté disponible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _updatesInit);
} else {
  _updatesInit();
}

// Patch de render(): re-verificar botón y badges después de cada render
// Espera con retry hasta que render esté definida
(function() {
  function _patchRender() {
    if (typeof render !== 'function') { setTimeout(_patchRender, 100); return; }
    const _orig = render;
    window.render = function() {
      _orig.apply(this, arguments);
      setTimeout(() => {
        _ensureDesktopBtn();
        _syncAllBadges();
      }, 80);
    };
  }
  _patchRender();
})();

// ----------------------------------------------------------------
// EXPOSE GLOBAL — disponible inmediatamente para onclick en HTML
// ----------------------------------------------------------------
window.openUpdates  = openUpdates;
window.closeUpdates = closeUpdates;
