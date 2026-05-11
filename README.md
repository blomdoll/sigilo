# Sigilo

Red social minimalista para compartir arte en texto. Los posts son solo palabras: sin imágenes, sin algoritmos, sin ruido.

**→ [Ver demo en vivo](https://sigilosy.vercel.app)**

---

## ¿Qué hace?

Sigilo es una comunidad donde los usuarios publican y leen texto puro — poesía, microficción, pensamientos, fragmentos. El foco está en la escritura, no en el engagement.

## Funcionalidades

- Autenticación con registro e inicio de sesión (Supabase)
- Feed de publicaciones en tiempo real
- Sistema de seguir usuarios y notificaciones
- Sección de explorar y búsqueda de perfiles
- Comunidad / sala de chat
- Página de actualizaciones/changelog
- Perfiles personalizables con temas de color (8 opciones)
- Favicon dinámico que cambia con el tema del usuario
- PWA instalable en móvil (Service Worker + Web App Manifest)
- Diseño completamente responsive con navegación inferior en móvil
- Modo claro / oscuro

## Tecnologías

- HTML5, CSS3, JavaScript vanilla
- [Supabase](https://supabase.com) (base de datos, autenticación en tiempo real)
- Service Worker (caché offline, PWA)
- Vercel (deploy)

## Estructura

```
sigilo/
├── index.html              # App principal
├── post.html               # Vista de post individual
├── legal.html              # Privacidad y términos
├── script.js               # Lógica principal (feed, posts, perfil)
├── script_follows.js       # Sistema de seguimiento y notificaciones
├── script_updates.js       # Panel de actualizaciones
├── styles.css              # Estilos principales y sistema de temas
├── styles_follows.css      # Estilos del sistema de seguimiento
├── styles_updates.css      # Estilos del panel de actualizaciones
├── sw.js                   # Service Worker
└── site.webmanifest        # Configuración PWA
```

## Correr localmente

```bash
git clone https://github.com/blomdoll/sigilo.git
cd sigilo
npx serve .
```

> Requiere una instancia de Supabase configurada. Las credenciales están en `script.js`.

---

Creado por [@blomdoll](https://github.com/blomdoll)
