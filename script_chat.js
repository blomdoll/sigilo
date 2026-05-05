// =============================================
//  SIGILO — CHAT GLOBAL
//  Tabla Supabase necesaria:
//
//  CREATE TABLE global_chat (
//    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//    user_id text NOT NULL,
//    username text NOT NULL,
//    avatar_url text,
//    body text NOT NULL,
//    created_at timestamptz DEFAULT now()
//  );
//  ALTER TABLE global_chat ENABLE ROW LEVEL SECURITY;
//  CREATE POLICY "read all" ON global_chat FOR SELECT USING (true);
//  CREATE POLICY "insert own" ON global_chat FOR INSERT WITH CHECK (auth.uid()::text = user_id);
//  CREATE POLICY "delete own" ON global_chat FOR DELETE USING (auth.uid()::text = user_id);
//
//  IMPORTANTE — habilitar Realtime en Supabase:
//  En el dashboard: Database → Replication → supabase_realtime publication
//  → agregar la tabla global_chat
// =============================================

(function() {
  'use strict';

  // ---- Estado del chat ----
  const CS = {
    open: false,
    messages: [],
    unread: 0,
    channel: null,
    loading: false,
    atBottom: true,
    // IDs temporales de mensajes propios enviados optimísticamente
    // (para evitar duplicarlos cuando llega el evento Realtime)
    pendingIds: new Set(),
  };

  const CHAT_LIMIT = 80;
  const MAX_MSG = 300;

  // ---- Esperar a que S.me y window.db estén listos ----
  function waitForAuth(cb, tries = 0) {
    if (window.S && window.S.me && window.db) { cb(); return; }
    if (tries > 80) return;
    setTimeout(() => waitForAuth(cb, tries + 1), 300);
  }

  // ---- Inicializar chat ----
  function initChat() {
    injectChatHTML();
    loadMessages();
    subscribeChat();
    bindEvents();
  }

  // ---- Inyectar HTML del botón y panel ----
  function injectChatHTML() {
    if (document.getElementById('chat-bubble')) return;

    // --- Botón flotante (escritorio) ---
    const bubble = document.createElement('button');
    bubble.id = 'chat-bubble';
    bubble.className = 'chat-bubble';
    bubble.title = 'Chat global';
    bubble.setAttribute('aria-label', 'Abrir chat global');
    bubble.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span id="chat-badge" class="chat-badge" style="display:none"></span>
    `;
    bubble.onclick = toggleChat;
    document.body.appendChild(bubble);

    // --- Botón móvil en el header ---
    const mobBtn = document.createElement('button');
    mobBtn.id = 'chat-mob-btn';
    mobBtn.className = 'chat-mob-btn';
    mobBtn.title = 'Chat global';
    mobBtn.setAttribute('aria-label', 'Abrir chat global');
    mobBtn.innerHTML = `
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span id="chat-mob-badge" class="chat-badge chat-badge-mob" style="display:none"></span>
    `;
    mobBtn.onclick = toggleChat;
    const header = document.querySelector('header');
    if (header) header.appendChild(mobBtn);

    // --- Panel de chat ---
    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>chat global</span>
          <span class="chat-online-dot"></span>
        </div>
        <button class="chat-close-btn" onclick="window.toggleChat()" aria-label="Cerrar chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-loading" id="chat-loading">cargando mensajes...</div>
      </div>
      <div class="chat-input-row">
        <input
          id="chat-input"
          class="chat-input"
          placeholder="escribe algo..."
          maxlength="${MAX_MSG}"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button class="chat-send-btn" id="chat-send" onclick="window.sendChatMsg()" aria-label="Enviar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(panel);
  }

  // ---- Bind eventos ----
  function bindEvents() {
    // Enter para enviar
    document.addEventListener('keydown', e => {
      if (!CS.open) return;
      const inp = document.getElementById('chat-input');
      if (e.target !== inp) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMsg();
      }
    });

    // Detectar scroll position
    const msgs = document.getElementById('chat-messages');
    if (msgs) {
      msgs.addEventListener('scroll', () => {
        const threshold = 60;
        CS.atBottom = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - threshold;
      });
    }

    // Cerrar con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && CS.open) toggleChat();
    });

    // Cerrar al click fuera
    document.addEventListener('click', e => {
      if (!CS.open) return;
      const panel = document.getElementById('chat-panel');
      const bubble = document.getElementById('chat-bubble');
      const mobBtn = document.getElementById('chat-mob-btn');
      if (
        panel && !panel.contains(e.target) &&
        bubble && !bubble.contains(e.target) &&
        mobBtn && !mobBtn.contains(e.target)
      ) {
        toggleChat();
      }
    });
  }

  // ---- Abrir / cerrar chat ----
  function toggleChat() {
    CS.open = !CS.open;
    const panel = document.getElementById('chat-panel');
    const bubble = document.getElementById('chat-bubble');
    const mobBtn = document.getElementById('chat-mob-btn');

    if (CS.open) {
      panel.style.display = 'flex';
      requestAnimationFrame(() => panel.classList.add('chat-panel-open'));
      bubble && bubble.classList.add('chat-bubble-active');
      mobBtn && mobBtn.classList.add('chat-mob-active');
      CS.unread = 0;
      updateBadge();
      setTimeout(() => scrollToBottom(true), 60);
      setTimeout(() => document.getElementById('chat-input')?.focus(), 80);
    } else {
      panel.classList.remove('chat-panel-open');
      bubble && bubble.classList.remove('chat-bubble-active');
      mobBtn && mobBtn.classList.remove('chat-mob-active');
      setTimeout(() => { panel.style.display = 'none'; }, 200);
    }
  }

  // ---- Cargar mensajes iniciales ----
  async function loadMessages() {
    CS.loading = true;
    renderMessages(); // Muestra "cargando..."
    try {
      const { data, error } = await window.db
        .from('global_chat')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(CHAT_LIMIT);

      if (error) throw error;
      CS.messages = data || [];
    } catch(e) {
      CS.messages = [];
    }
    CS.loading = false;
    renderMessages();
    scrollToBottom(true);
  }

  // ---- Suscribirse a mensajes en tiempo real ----
  function subscribeChat() {
    if (CS.channel) {
      window.db.removeChannel(CS.channel);
      CS.channel = null;
    }

    CS.channel = window.db
      .channel('global_chat_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'global_chat',
      }, payload => {
        const msg = payload.new;

        // Si es un mensaje nuestro que ya mostramos optimísticamente, solo
        // actualizamos su ID real en el DOM (para que el botón eliminar funcione)
        // y lo registramos en CS.messages con el id real.
        if (CS.pendingIds.has(msg.body + '|' + msg.user_id)) {
          CS.pendingIds.delete(msg.body + '|' + msg.user_id);
          // Reemplazar el nodo temporal con el id real
          const tempEl = document.getElementById('chatmsg-pending-' + btoa(msg.body).slice(0, 12));
          if (tempEl) {
            tempEl.id = 'chatmsg-' + msg.id;
            // Actualizar el botón de eliminar con el id real
            const delBtn = tempEl.querySelector('.chat-del-btn');
            if (delBtn) delBtn.setAttribute('onclick', `window.deleteChatMsg('${msg.id}')`);
          }
          // Registrar en memoria con id real
          const idx = CS.messages.findIndex(m => m._pending && m.body === msg.body && m.user_id === msg.user_id);
          if (idx > -1) CS.messages[idx] = msg;
          else CS.messages.push(msg);
          return;
        }

        // Mensaje de otro usuario — evitar duplicados normales
        if (CS.messages.find(m => m.id === msg.id)) return;

        CS.messages.push(msg);
        if (CS.messages.length > CHAT_LIMIT) CS.messages.shift();

        appendMessage(msg);

        if (CS.open) {
          if (CS.atBottom) scrollToBottom(true);
        } else {
          CS.unread++;
          updateBadge();
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'global_chat',
      }, payload => {
        CS.messages = CS.messages.filter(m => m.id !== payload.old.id);
        const el = document.getElementById('chatmsg-' + payload.old.id);
        if (el) el.remove();
      })
      .subscribe(status => {
        // Si la suscripción falla, reintentamos tras 3s
        if (status === 'CHANNEL_ERROR') {
          setTimeout(subscribeChat, 3000);
        }
      });
  }

  // ---- Renderizar todos los mensajes ----
  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (CS.loading) {
      container.innerHTML = `<div class="chat-loading">cargando mensajes...</div>`;
      return;
    }

    if (CS.messages.length === 0) {
      container.innerHTML = `<div class="chat-empty">✦ sé el primero en escribir algo</div>`;
      return;
    }

    container.innerHTML = '';
    CS.messages.forEach(msg => appendMessage(msg, false));
  }

  // ---- Agregar un mensaje al DOM ----
  function appendMessage(msg, animate = true) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();
    const loading = container.querySelector('.chat-loading');
    if (loading) loading.remove();

    const me = window.S?.me;
    const isOwn = me && msg.user_id === me.id;
    const name = escChat(msg.username || 'Usuario');
    const ini = (msg.username || '?')[0].toUpperCase();
    const timeStr = chatAgo(msg.created_at);

    const avatarHtml = msg.avatar_url
      ? `<div class="chat-av"><img src="${escChat(msg.avatar_url)}" alt=""/></div>`
      : `<div class="chat-av chat-av-ini">${ini}</div>`;

    const el = document.createElement('div');
    // ID temporal para mensajes pending, real para el resto
    const elId = msg._pending
      ? 'chatmsg-pending-' + btoa(msg.body).slice(0, 12)
      : 'chatmsg-' + msg.id;
    el.id = elId;
    el.className = `chat-msg${isOwn ? ' chat-msg-own' : ''}${animate ? ' chat-msg-in' : ''}`;

    // El botón de eliminar solo aparece si ya tenemos id real (no pending)
    const delBtn = (isOwn && !msg._pending)
      ? `<button class="chat-del-btn" onclick="window.deleteChatMsg('${msg.id}')" title="Eliminar">×</button>`
      : '';

    el.innerHTML = `
      ${!isOwn ? avatarHtml : ''}
      <div class="chat-msg-content">
        ${!isOwn ? `<div class="chat-msg-name" onclick="window.vprof && window.vprof('${msg.user_id}')">${name}</div>` : ''}
        <div class="chat-msg-bubble">
          <span class="chat-msg-text">${escChat(msg.body)}</span>
          ${delBtn}
        </div>
        <div class="chat-msg-time">${timeStr}</div>
      </div>
      ${isOwn ? avatarHtml : ''}
    `;

    container.appendChild(el);
  }

  // ---- Enviar mensaje — aparece INMEDIATAMENTE (optimistic UI) ----
  async function sendChatMsg() {
    const inp = document.getElementById('chat-input');
    if (!inp) return;
    const body = inp.value.trim();
    if (!body) return;
    if (body.length > MAX_MSG) return;

    const me = window.S?.me;
    if (!me) return;

    const myName = me.user_metadata?.display_name || me.email || 'Usuario';
    const myAv = me.user_metadata?.avatar_url || null;

    // 1. Limpiar input de inmediato
    inp.value = '';

    // 2. Crear mensaje optimista y mostrarlo YA
    const optimisticMsg = {
      _pending: true,
      id: null,
      user_id: me.id,
      username: myName,
      avatar_url: myAv,
      body,
      created_at: new Date().toISOString(),
    };
    CS.messages.push(optimisticMsg);
    if (CS.messages.length > CHAT_LIMIT) CS.messages.shift();
    appendMessage(optimisticMsg, true);
    CS.atBottom = true;
    scrollToBottom(false);

    // 3. Marcar como pending para que Realtime no lo duplique
    CS.pendingIds.add(body + '|' + me.id);

    // 4. Hacer el INSERT real en Supabase
    try {
      const { error } = await window.db.from('global_chat').insert([{
        user_id: me.id,
        username: myName,
        avatar_url: myAv,
        body,
      }]);
      if (error) throw error;
    } catch(e) {
      // Si falla: quitar el mensaje optimista y restaurar el input
      CS.pendingIds.delete(body + '|' + me.id);
      CS.messages = CS.messages.filter(m => !(m._pending && m.body === body && m.user_id === me.id));
      const tempEl = document.getElementById('chatmsg-pending-' + btoa(body).slice(0, 12));
      if (tempEl) tempEl.remove();
      inp.value = body;
      window.toast && window.toast('Error al enviar mensaje');
    }

    inp.focus();
  }

  // ---- Eliminar mensaje propio ----
  async function deleteChatMsg(id) {
    // Quitar del DOM y memoria de inmediato (optimistic)
    CS.messages = CS.messages.filter(m => m.id !== id);
    const el = document.getElementById('chatmsg-' + id);
    if (el) el.remove();

    try {
      await window.db.from('global_chat').delete().eq('id', id);
    } catch(e) {
      window.toast && window.toast('Error al eliminar');
    }
  }

  // ---- Scroll al fondo ----
  function scrollToBottom(instant = false) {
    const c = document.getElementById('chat-messages');
    if (!c) return;
    c.scrollTo({ top: c.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
  }

  // ---- Actualizar badge ----
  function updateBadge() {
    const count = CS.unread;
    const text = count > 9 ? '9+' : (count || '');
    ['chat-badge', 'chat-mob-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  // ---- Helpers ----
  function escChat(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function chatAgo(ts) {
    if (!ts) return '';
    const normalized = (typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+')) ? ts + 'Z' : ts;
    const d = Date.now() - new Date(normalized).getTime();
    if (isNaN(d) || d < 0) return 'ahora';
    if (d < 60000) return 'ahora';
    if (d < 3600000) return ~~(d/60000) + 'm';
    if (d < 86400000) return ~~(d/3600000) + 'h';
    return ~~(d/86400000) + 'd';
  }

  // ---- Exponer globalmente ----
  window.toggleChat = toggleChat;
  window.sendChatMsg = sendChatMsg;
  window.deleteChatMsg = deleteChatMsg;

  // ---- Arrancar cuando el usuario esté autenticado ----
  waitForAuth(initChat);

})();
