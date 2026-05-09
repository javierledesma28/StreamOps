const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3033);
const WRITE_TOKEN = process.env.WRITE_TOKEN || "";
const VIEW_TOKEN = process.env.VIEW_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

let nowPlaying = {
  source: "SoundCloud",
  artist: "SoundCloud",
  title: "Esperando reproducción...",
  url: "",
  currentTime: "0:00",
  duration: "0:00",
  progress: 0,
  isPlaying: false,
  updatedAt: new Date().toISOString()
};

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host}`);
}

function hasWriteAccess(url) {
  if (!WRITE_TOKEN) return true;
  return url.searchParams.get("token") === WRITE_TOKEN;
}

function hasViewAccess(url) {
  if (!VIEW_TOKEN) return true;
  return url.searchParams.get("token") === VIEW_TOKEN;
}

function hasAdminAccess(url, req) {
  if (!ADMIN_TOKEN) return false;
  return (
    url.searchParams.get("token") === ADMIN_TOKEN ||
    req.headers["x-admin-token"] === ADMIN_TOKEN
  );
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });

  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });

  res.end(text);
}

function sendHtml(res, filePath) {
  fs.readFile(filePath, "utf8", (error, content) => {
    if (error) {
      sendText(res, 500, "Error loading overlay");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    });

    res.end(content);
  });
}

function sendAdminPanel(res) {
  const uptimeSeconds = Math.floor(process.uptime());
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const routes = [
    {
      method: "GET",
      path: "/health",
      description: "Healthcheck básico del servicio."
    },
    {
      method: "GET",
      path: "/api/nowplaying",
      description: "Devuelve la canción actual. Requiere view token."
    },
    {
      method: "GET",
      path: "/overlay/music",
      description: "Overlay de música para Streamlabs / OBS. Requiere view token."
    },
    {
      method: "POST",
      path: "/api/nowplaying",
      description: "Actualiza la metadata de reproducción. Requiere write token."
    },
    {
      method: "GET",
      path: "/admin",
      description: "Panel privado de administración. Requiere admin token."
    }
  ];

  const routesHtml = routes.map(route => `
    <div class="route">
      <div class="method">${route.method}</div>
      <div class="path">${route.path}</div>
      <div class="desc">${route.description}</div>
    </div>
  `).join("");

  const lastUpdate = nowPlaying.updatedAt
    ? new Date(nowPlaying.updatedAt).toLocaleString("es-ES")
    : "Sin datos";

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });

  res.end(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StreamOps Admin</title>
  <style>
    :root {
      --bg: #050608;
      --panel: #0d1117;
      --border: #243244;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --ok: #22c55e;
      --warn: #facc15;
      --blue: #38bdf8;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.13), transparent 28%),
        radial-gradient(circle at bottom right, rgba(34, 197, 94, 0.08), transparent 30%),
        var(--bg);
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-x: hidden;
    }

    .scanline {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(to bottom, rgba(255,255,255,0.025), rgba(255,255,255,0) 2px);
      background-size: 100% 4px;
      opacity: 0.22;
      z-index: 5;
    }

    .shell {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 42px 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 28px;
    }

    .eyebrow {
      color: var(--blue);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    h1 {
      margin: 0;
      font-size: clamp(32px, 6vw, 58px);
      line-height: 1;
      letter-spacing: -0.05em;
    }

    .subtitle {
      margin-top: 14px;
      color: var(--muted);
      max-width: 720px;
      line-height: 1.6;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border: 1px solid rgba(34, 197, 94, 0.35);
      background: rgba(34, 197, 94, 0.08);
      border-radius: 999px;
      color: #bbf7d0;
      white-space: nowrap;
    }

    .dot {
      width: 10px;
      height: 10px;
      background: var(--ok);
      border-radius: 50%;
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.9);
      animation: pulse 1.4s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.45); opacity: 0.55; }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
    }

    .card {
      background: linear-gradient(180deg, rgba(17,24,39,0.92), rgba(13,17,23,0.92));
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      top: 0;
      left: -100%;
      width: 80%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(56,189,248,0.9), transparent);
      animation: sweep 4s infinite linear;
    }

    @keyframes sweep {
      0% { left: -100%; }
      50%, 100% { left: 120%; }
    }

    .span-4 { grid-column: span 4; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }

    .label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }

    .value {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.03em;
    }

    .small {
      font-size: 13px;
      color: var(--muted);
      margin-top: 8px;
      line-height: 1.5;
    }

    .routes {
      display: grid;
      gap: 12px;
    }

    .route {
      display: grid;
      grid-template-columns: 90px minmax(180px, 270px) 1fr;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border-radius: 16px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.06);
    }

    .method {
      font-size: 12px;
      font-weight: 800;
      color: var(--ok);
      border: 1px solid rgba(34, 197, 94, 0.35);
      background: rgba(34, 197, 94, 0.08);
      border-radius: 999px;
      padding: 6px 10px;
      text-align: center;
    }

    .path {
      font-family: "JetBrains Mono", "Cascadia Code", monospace;
      color: #f9fafb;
      font-size: 14px;
    }

    .desc {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .terminal {
      font-family: "JetBrains Mono", "Cascadia Code", monospace;
      font-size: 13px;
      line-height: 1.7;
      color: #d1d5db;
    }

    .ok { color: var(--ok); }
    .info { color: var(--blue); }
    .warn { color: var(--warn); }

    footer {
      margin-top: 20px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }

    @media (max-width: 800px) {
      .header { flex-direction: column; }
      .span-4, .span-8, .span-12 { grid-column: span 12; }
      .route { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="scanline"></div>

  <main class="shell">
    <section class="header">
      <div>
        <div class="eyebrow">StreamOps / Control Plane</div>
        <h1>Admin Panel</h1>
        <p class="subtitle">
          Panel operativo minimalista para validar el estado de StreamOps, sus rutas principales
          y el overlay de música. Los valores sensibles se mantienen ocultos.
        </p>
      </div>

      <div class="status-pill">
        <span class="dot"></span>
        Online
      </div>
    </section>

    <section class="grid">
      <article class="card span-4">
        <div class="label">Servicio</div>
        <div class="value">StreamOps</div>
        <div class="small">Overlay automation service</div>
      </article>

      <article class="card span-4">
        <div class="label">Uptime</div>
        <div class="value">${uptimeHours}h ${uptimeMinutes % 60}m</div>
        <div class="small">${uptimeSeconds} segundos en ejecución</div>
      </article>

      <article class="card span-4">
        <div class="label">Runtime</div>
        <div class="value">Node.js</div>
        <div class="small">${process.version}</div>
      </article>

      <article class="card span-4">
        <div class="label">Now Playing</div>
        <div class="value">${escapeHtml(nowPlaying.title)}</div>
        <div class="small">
          Artist: ${escapeHtml(nowPlaying.artist)}<br />
          Playing: ${nowPlaying.isPlaying ? "yes" : "no"}<br />
          Progress: ${Number(nowPlaying.progress || 0)}%
        </div>
      </article>

      <article class="card span-4">
        <div class="label">Última actualización</div>
        <div class="value">${lastUpdate}</div>
        <div class="small">Último update recibido por /api/nowplaying</div>
      </article>

      <article class="card span-4">
        <div class="label">Seguridad</div>
        <div class="value">Tokens ocultos</div>
        <div class="small">Admin, view y write tokens no se muestran en pantalla.</div>
      </article>

      <article class="card span-8">
        <div class="label">Available Routes</div>
        <div class="routes">
          ${routesHtml}
        </div>
      </article>

      <article class="card span-4">
        <div class="label">System Check</div>
        <div class="terminal">
          <div><span class="ok">●</span> service: online</div>
          <div><span class="ok">●</span> admin auth: enabled</div>
          <div><span class="ok">●</span> view token: ${VIEW_TOKEN ? "enabled" : "disabled"}</div>
          <div><span class="ok">●</span> write token: ${WRITE_TOKEN ? "enabled" : "disabled"}</div>
          <div><span class="info">●</span> overlay: protected</div>
          <div><span class="warn">●</span> root: not exposed</div>
        </div>
      </article>

      <article class="card span-12">
        <div class="label">Security Notice</div>
        <div class="desc">
          Este panel no muestra tokens completos, secretos de Cloudflare, información interna de Docker
          ni credenciales de escritura. Usa este endpoint únicamente desde dispositivos confiables.
        </div>
      </article>
    </section>

    <footer>
      StreamOps · t28.io · Admin view
    </footer>
  </main>
</body>
</html>`);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const server = http.createServer((req, res) => {
  const url = parseUrl(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    sendText(res, 404, "Not found");
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "streamops",
      uptime: Math.floor(process.uptime()),
      nowPlayingUpdatedAt: nowPlaying.updatedAt,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin") {
    if (!hasAdminAccess(url, req)) {
      sendText(res, 401, "Unauthorized");
      return;
    }

    sendAdminPanel(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/nowplaying") {
    if (!hasViewAccess(url)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    sendJson(res, 200, nowPlaying);
    return;
  }

  if (req.method === "GET" && url.pathname === "/overlay/music") {
    if (!hasViewAccess(url)) {
      sendText(res, 401, "Unauthorized");
      return;
    }

    const overlayPath = path.join(__dirname, "public", "overlay-music.html");
    sendHtml(res, overlayPath);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/nowplaying") {
    if (!hasWriteAccess(url)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");

        nowPlaying = {
          source: "SoundCloud",
          artist: data.artist || "SoundCloud",
          title: data.title || "Track desconocido",
          url: data.url || "",
          currentTime: data.currentTime || "0:00",
          duration: data.duration || "0:00",
          progress: Number(data.progress || 0),
          isPlaying: Boolean(data.isPlaying),
          updatedAt: new Date().toISOString()
        };

        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
    });

    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`StreamOps running on http://0.0.0.0:${PORT}`);
});