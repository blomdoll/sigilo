import { NextResponse } from 'next/server';

export function middleware() {
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sigilo - Pausa Mística</title>
      <style>
        :root {
          --bg: #FBF6F0;
          --w1: #C9785A;
          --tx: #2C1810;
          --medianoche: #8B7CF8;
        }
        body {
          background: var(--bg);
          color: var(--tx);
          font-family: 'Playfair Display', serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          text-align: center;
          padding: 20px;
        }
        .container {
          max-width: 500px;
          animation: fadeIn 2s ease-in;
        }
        h1 {
          color: var(--w1);
          font-size: 2.5rem;
          margin-bottom: 1rem;
          font-weight: 500;
        }
        p {
          font-size: 1.1rem;
          line-height: 1.6;
          opacity: 0.8;
        }
        .icon {
          font-size: 3rem;
          margin-bottom: 20px;
          color: var(--medianoche);
          filter: drop-shadow(0 0 10px rgba(139, 124, 248, 0.3));
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✧</div>
        <h1>Sigilo está en calma</h1>
        <p>Estamos moviendo las estrellas (y los avatares) a un nuevo cosmos más grande de 150GB. Volveremos pronto con más magia en texto.</p>
        <p style="font-size: 0.8rem; margin-top: 2rem; color: var(--w1);">— MusgoText Team —</p>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  );
}

export const config = {
  // Esto bloquea todas las rutas excepto archivos estáticos
  matcher: '/((?!api|_next|static|public|favicon.ico).*)',
};