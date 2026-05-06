/* ================================================================
   SIGILO — SISTEMA DE ANUNCIOS EMERGENTES
   script_announce.js

   USO RÁPIDO:
   ──────────────────────────────────────────────────────────────
   Para publicar un anuncio nuevo, edita el objeto ANNOUNCE_CONFIG
   al inicio de este archivo. Los campos son:

     id       → Identificador ÚNICO del anuncio. Cámbialo cada vez
                 que quieras que aparezca de nuevo a todos los usuarios.
                 (ej: "v1.3-nueva-funcion", "evento-agosto-2025")

     active   → true para activarlo, false para desactivarlo.

     emoji    → Ícono que aparece en el popup (ej: "✦", "🎉", "📢")

     label    → Etiqueta pequeña en la parte superior (ej: "novedad")

     title    → Título principal del anuncio.

     message  → Cuerpo del mensaje. Puedes usar saltos de línea (\n).

     date     → Fecha a mostrar (texto libre, ej: "mayo 2025")

     btnText  → Texto del botón principal (ej: "entendido ✦")

     btnUrl   → URL opcional. Si lo pones, el botón abre ese enlace.
                 Si lo dejas vacío (""), solo cierra el popup.

   ──────────────────────────────────────────────────────────────
   EJEMPLO DE FLUJO PARA UN ANUNCIO NUEVO:
   1. Cambia `id` por algo único (ej: "update-junio-2025")
   2. Pon `active: true`
   3. Llena título, mensaje, etc.
   4. Sube los archivos. Todos los usuarios que no hayan visto
      este id específico verán el popup la próxima vez que entren.
   ================================================================ */

const ANNOUNCE_CONFIG = {
  // ─── EDITA AQUÍ ──────────────────────────────────────────────
  id:      'anuncio-unicode01',        // ← cambia esto para cada anuncio nuevo
  active:  true,               // ← pon true para activarlo

  emoji:   '✦',
  label:   'anuncio parroquial',
  title:   'Compatibilidad con UNICODE',
  message: 'Tal vez hayas notado que algunos caracteres
            no se muestran correctamente. 
            Esto se debe a que el sistema de renderizado
            que usamos no soporta todos los caracteres UNICODE.
            Estoy trabajando en una solución para mejorar esto
            en futuras actualizaciones. ¡Gracias por su paciencia!',
  date:    '06 mayo 2026',
  btnText: 'entendido ✦',
  btnUrl:  '',                  // URL opcional; dejar '' para solo cerrar
  // ─────────────────────────────────────────────────────────────
};

// Clave en localStorage — incluye el id para que sea única por anuncio
function _announceKey() {
  return 'sigilo_announce_seen_' + ANNOUNCE_CONFIG.id;
}

// Verifica si el usuario ya vio ESTE anuncio
function _announceSeen() {
  try { return localStorage.getItem(_announceKey()) === '1'; } catch(e) { return false; }
}

// Marca el anuncio como visto
function _announceMarkSeen() {
  try { localStorage.setItem(_announceKey(), '1'); } catch(e) {}
}

// Cierra el popup con animación
function closeAnnounce() {
  const overlay = document.getElementById('announceOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => {
    overlay.remove();
  }, 300);
}

// Crea e inyecta el popup en el DOM
function _buildAnnouncePopup() {
  const c = ANNOUNCE_CONFIG;

  // Formatear mensaje (saltos de línea → ya manejados con white-space:pre-wrap)
  const msg = c.message || '';

  // Determinar acción del botón
  const btnAction = c.btnUrl
    ? `window.open('${c.btnUrl}', '_blank', 'noopener'); closeAnnounce();`
    : `closeAnnounce();`;

  const html = `
  <div class="announce-overlay" id="announceOverlay" role="dialog" aria-modal="true" aria-labelledby="announceTitle">
    <div class="announce-card">
      <button class="announce-close" onclick="closeAnnounce()" title="Cerrar" aria-label="Cerrar anuncio">✕</button>
      <div class="announce-header">
        <div class="announce-icon" aria-hidden="true">${c.emoji || '✦'}</div>
        <div>
          <div class="announce-subtitle">${_esc(c.label || 'anuncio')}</div>
          <h2 class="announce-title" id="announceTitle">${_esc(c.title || '')}</h2>
        </div>
      </div>
      <div class="announce-divider"></div>
      <div class="announce-body">${_esc(msg)}</div>
      <div class="announce-footer">
        <span class="announce-date"><span class="announce-brand-star">✦</span>sigilo · ${_esc(c.date || '')}</span>
        <button class="announce-btn" onclick="${btnAction}">${_esc(c.btnText || 'entendido')}</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Forzar reflow para que la animación funcione
  const overlay = document.getElementById('announceOverlay');
  overlay.getBoundingClientRect();
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // Cerrar al hacer click en el fondo (fuera de la tarjeta)
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeAnnounce();
  });

  // Cerrar con Escape
  function onEsc(e) {
    if (e.key === 'Escape') { closeAnnounce(); document.removeEventListener('keydown', onEsc); }
  }
  document.addEventListener('keydown', onEsc);
}

// Función auxiliar para escapar HTML
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Punto de entrada principal: llama esto cuando el usuario ya está logueado
function initAnnounce() {
  if (!ANNOUNCE_CONFIG.active) return;   // desactivado → no hacer nada
  if (_announceSeen()) return;           // ya lo vio → no mostrarlo de nuevo

  // Pequeño delay para que la app termine de cargar antes de mostrar el popup
  setTimeout(() => {
    _buildAnnouncePopup();
    _announceMarkSeen();                 // marcar como visto inmediatamente
  }, 800);
}
