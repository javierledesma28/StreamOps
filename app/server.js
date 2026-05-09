const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3033);
const WRITE_TOKEN = process.env.WRITE_TOKEN || "";
const VIEW_TOKEN = process.env.VIEW_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

const SERVICES_CONFIG = [
  {
    id: "streamops",
    name: "StreamOps",
    publicName: "StreamOps",
    url: "https://streamops.t28.io/health",
    publicUrl: "https://streamops.t28.io",
    category: "Control Plane",
    expectedStatus: 200,
    timeoutMs: 5000,
    public: true
  },
  {
    id: "azurehub",
    name: "AzureHub",
    publicName: "AzureHub",
    url: "https://azurehub.t28.io/",
    publicUrl: "https://azurehub.t28.io",
    category: "Cloud Architecture Studio",
    expectedStatus: 200,
    timeoutMs: 5000,
    public: true
  }
];

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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });

  res.end(JSON.stringify(payload, null, 2));
}

function sendPublicJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
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

function sendPublicHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(html);
}

function checkHttpService(service) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const targetUrl = new URL(service.url);
    const client = targetUrl.protocol === "https:" ? https : http;

    const req = client.request(
      {
        method: "GET",
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        timeout: service.timeoutMs || 5000,
        headers: {
          "User-Agent": "StreamOps-Status-Checker/1.0"
        }
      },
      (response) => {
        response.resume();

        response.on("end", () => {
          const latencyMs = Date.now() - startedAt;
          const expectedStatus = service.expectedStatus || 200;
          const healthy = response.statusCode === expectedStatus;

          resolve({
            id: service.id,
            name: service.name,
            publicName: service.publicName,
            category: service.category,
            status: healthy ? "operational" : "degraded",
            healthy,
            statusCode: response.statusCode,
            expectedStatus,
            latencyMs,
            checkedAt: new Date().toISOString(),
            publicUrl: service.publicUrl,
            public: Boolean(service.public)
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });

    req.on("error", (error) => {
      resolve({
        id: service.id,
        name: service.name,
        publicName: service.publicName,
        category: service.category,
        status: "down",
        healthy: false,
        statusCode: null,
        expectedStatus: service.expectedStatus || 200,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        publicUrl: service.publicUrl,
        public: Boolean(service.public),
        error: error.message === "timeout" ? "timeout" : "unreachable"
      });
    });

    req.end();
  });
}

async function getStackStatus() {
  const services = await Promise.all(SERVICES_CONFIG.map(checkHttpService));
  const total = services.length;
  const healthy = services.filter((service) => service.healthy).length;
  const degraded = services.filter((service) => !service.healthy && service.status !== "down").length;
  const down = services.filter((service) => service.status === "down").length;

  let overallStatus = "operational";
  if (down > 0) overallStatus = "major_outage";
  else if (degraded > 0 || healthy < total) overallStatus = "degraded";

  return {
    ok: overallStatus === "operational",
    service: "streamops",
    product: "Mate and Cloud",
    poweredBy: "T28",
    status: overallStatus,
    summary: {
      total,
      healthy,
      degraded,
      down
    },
    services,
    checkedAt: new Date().toISOString()
  };
}

function sanitizeStatusForPublic(stackStatus) {
  return {
    ok: stackStatus.ok,
    product: stackStatus.product,
    poweredBy: stackStatus.poweredBy,
    status: stackStatus.status,
    summary: stackStatus.summary,
    services: stackStatus.services
      .filter((service) => service.public)
      .map((service) => ({
        id: service.id,
        name: service.publicName,
        category: service.category,
        status: service.status,
        healthy: service.healthy,
        latencyMs: service.latencyMs,
        checkedAt: service.checkedAt,
        publicUrl: service.publicUrl
      })),
    checkedAt: stackStatus.checkedAt
  };
}

function getStatusLabel(status) {
  if (status === "operational") return "Operational";
  if (status === "degraded") return "Degraded";
  if (status === "major_outage") return "Major outage";
  return "Unknown";
}

function statusDotClass(status) {
  if (status === "operational") return "dot-ok";
  if (status === "degraded") return "dot-warn";
  return "dot-down";
}

function baseStyles() {
  return `
    :root {
      color-scheme: dark;
      --bg: #050816;
      --panel: rgba(15, 23, 42, 0.72);
      --panel-strong: rgba(15, 23, 42, 0.92);
      --border: rgba(148, 163, 184, 0.18);
      --text: #e5eefc;
      --muted: #91a4bd;
      --accent: #38bdf8;
      --accent-2: #a78bfa;
      --ok: #34d399;
      --warn: #fbbf24;
      --down: #fb7185;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 36rem),
        radial-gradient(circle at bottom right, rgba(167, 139, 250, 0.16), transparent 32rem),
        linear-gradient(135deg, #020617 0%, #050816 42%, #0f172a 100%);
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .shell {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
      padding: 44px 0;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      margin-bottom: 34px;
    }

    .brand-kicker {
      color: var(--accent);
      font-size: 13px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 800;
    }

    h1 {
      margin: 10px 0 8px;
      font-size: clamp(34px, 6vw, 68px);
      line-height: 0.95;
      letter-spacing: -0.06em;
    }

    .subtitle {
      color: var(--muted);
      max-width: 780px;
      font-size: 17px;
      line-height: 1.7;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.62);
      color: var(--muted);
      backdrop-filter: blur(16px);
      font-size: 13px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 18px;
    }

    .card {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 28px;
      padding: 24px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(20px);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.09), transparent 34%, rgba(167, 139, 250, 0.08));
      pointer-events: none;
    }

    .card > * {
      position: relative;
      z-index: 1;
    }

    .span-4 {
      grid-column: span 4;
    }

    .span-6 {
      grid-column: span 6;
    }

    .span-8 {
      grid-column: span 8;
    }

    .span-12 {
      grid-column: span 12;
    }

    .metric {
      color: var(--muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 800;
    }

    .metric-value {
      margin-top: 12px;
      font-size: 34px;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .service-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 16px;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }

    .service-row:last-child {
      border-bottom: 0;
    }

    .service-name {
      font-weight: 850;
      font-size: 16px;
    }

    .service-category {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(2, 6, 23, 0.48);
      color: var(--text);
      font-size: 13px;
      font-weight: 800;
    }

    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      display: inline-block;
      box-shadow: 0 0 22px currentColor;
    }

    .dot-ok {
      background: var(--ok);
      color: var(--ok);
    }

    .dot-warn {
      background: var(--warn);
      color: var(--warn);
    }

    .dot-down {
      background: var(--down);
      color: var(--down);
    }

    .muted {
      color: var(--muted);
    }

    .footer {
      margin-top: 24px;
      color: var(--muted);
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    code {
      color: #bae6fd;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid var(--border);
      padding: 3px 7px;
      border-radius: 8px;
    }

    @media (max-width: 840px) {
      .span-4,
      .span-6,
      .span-8 {
        grid-column: span 12;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .service-row {
        grid-template-columns: 1fr;
      }
    }
  `;
}

function renderStatusPage(stackStatus, options = {}) {
  const publicStatus = options.publicOnly ? sanitizeStatusForPublic(stackStatus) : stackStatus;
  const label = getStatusLabel(publicStatus.status);
    const checkedAtLabel = new Date(publicStatus.checkedAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const servicesHtml = publicStatus.services.map((service) => `
    <div class="service-row">
      <div>
        <div class="service-name">${escapeHtml(service.name)}</div>
        <div class="service-category">${escapeHtml(service.category)}</div>
      </div>
      <div class="status-badge">
        <span class="dot ${statusDotClass(service.status)}"></span>
        ${escapeHtml(service.status)}
      </div>
      <div class="muted">${Number(service.latencyMs || 0)} ms</div>
    </div>
  `).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mate and Cloud · Stack Status</title>
    <meta http-equiv="refresh" content="30" />
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="shell">
    <section class="topbar">
      <div>
        <div class="brand-kicker">Mate and Cloud</div>
        <h1>Stack Status</h1>
        <p class="subtitle">
          Estado sanitizado de los servicios públicos que dan soporte al ecosistema Mate and Cloud.
          Built on StreamOps.
        </p>
      </div>
      <div class="pill">
        <span class="dot ${statusDotClass(publicStatus.status)}"></span>
        ${escapeHtml(label)}
      </div>
    </section>

    <section class="grid">
      <article class="card span-4">
        <div class="metric">Overall Status</div>
        <div class="metric-value">${escapeHtml(label)}</div>
        <p class="muted">Última verificación: ${escapeHtml(checkedAtLabel)}</p>
        <p class="muted">Auto-refresh cada 30 segundos.</p>
      </article>

      <article class="card span-4">
        <div class="metric">Healthy Services</div>
        <div class="metric-value">${publicStatus.summary.healthy}/${publicStatus.summary.total}</div>
        <p class="muted">Servicios operativos dentro del stack público.</p>
      </article>

      <article class="card span-4">
        <div class="metric">Powered By</div>
        <div class="metric-value">T28</div>
        <p class="muted">Powered by T28 / Built on StreamOps.</p>
      </article>

      <article class="card span-12">
        <div class="metric">Services</div>
        ${servicesHtml}
      </article>
    </section>

    <footer class="footer">
      <span>Mate and Cloud · Powered by T28</span>
      <span>Public sanitized status · Auto-refresh 30s · No internal infrastructure exposed</span>
    </footer>
  </main>
</body>
</html>`;
}

function renderOverlayStatus(stackStatus) {
  const publicStatus = sanitizeStatusForPublic(stackStatus);
  const label = getStatusLabel(publicStatus.status);
    const checkedAtLabel = new Date(publicStatus.checkedAt).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium"
  });

  const servicesHtml = publicStatus.services.map((service) => `
    <div class="svc">
      <span><i class="${statusDotClass(service.status)}"></i>${escapeHtml(service.name)}</span>
      <b>${escapeHtml(service.status)}</b>
    </div>
  `).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mate and Cloud · Overlay Status</title>
  <meta http-equiv="refresh" content="15" />
  <style>
    :root {
      color-scheme: dark;
      --text: #e5eefc;
      --muted: #91a4bd;
      --ok: #34d399;
      --warn: #fbbf24;
      --down: #fb7185;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: transparent;
    }

    .overlay {
      position: absolute;
      right: 32px;
      bottom: 32px;
      width: 420px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 26px;
      padding: 20px;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.22), transparent 18rem),
        linear-gradient(135deg, rgba(2, 6, 23, 0.9), rgba(15, 23, 42, 0.76));
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(18px);
    }

    .kicker {
      color: #38bdf8;
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 900;
    }

    .title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
      margin-bottom: 16px;
    }

    .title h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.04em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 11px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(148, 163, 184, 0.22);
      font-size: 12px;
      font-weight: 850;
    }

    .svc {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      color: var(--muted);
      font-size: 14px;
    }

    .svc span {
      display: inline-flex;
      align-items: center;
      gap: 9px;
    }

    .svc b {
      color: var(--text);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    i,
    .dot {
      width: 9px;
      height: 9px;
      display: inline-block;
      border-radius: 999px;
      box-shadow: 0 0 20px currentColor;
    }

    .dot-ok {
      background: var(--ok);
      color: var(--ok);
    }

    .dot-warn {
      background: var(--warn);
      color: var(--warn);
    }

    .dot-down {
      background: var(--down);
      color: var(--down);
    }

    .footer {
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <section class="overlay">
    <div class="kicker">Mate and Cloud</div>
    <div class="title">
      <h1>Stack Health</h1>
      <div class="badge">
        <span class="dot ${statusDotClass(publicStatus.status)}"></span>
        ${escapeHtml(label)}
      </div>
    </div>

    ${servicesHtml}

    <div class="footer">
  Updated ${escapeHtml(checkedAtLabel)} · Auto-refresh 15s · Powered by T28
</div>
  </section>
</body>
</html>`;
}

async function sendAdminPanel(res) {
  const stackStatus = await getStackStatus();

  const uptimeSeconds = Math.floor(process.uptime());
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const routes = [
    { method: "GET", path: "/health", description: "Healthcheck básico del servicio." },
    { method: "GET", path: "/api/status", description: "Estado privado del stack. Requiere admin token." },
    { method: "GET", path: "/status", description: "Página pública sanitizada del stack." },
    { method: "GET", path: "/overlay/status", description: "Overlay de estado para Streamlabs / OBS. Requiere view token." },
    { method: "GET", path: "/api/nowplaying", description: "Devuelve la canción actual. Requiere view token." },
    { method: "GET", path: "/overlay/music", description: "Overlay de música para Streamlabs / OBS. Requiere view token." },
    { method: "POST", path: "/api/nowplaying", description: "Actualiza la metadata de reproducción. Requiere write token." },
    { method: "GET", path: "/admin", description: "Panel privado de administración. Requiere admin token." }
  ];

  const routesHtml = routes.map(route => `
    <div class="service-row">
      <div>
        <div class="service-name"><code>${escapeHtml(route.method)}</code> ${escapeHtml(route.path)}</div>
        <div class="service-category">${escapeHtml(route.description)}</div>
      </div>
    </div>
  `).join("");

  const servicesHtml = stackStatus.services.map((service) => `
    <div class="service-row">
      <div>
        <div class="service-name">${escapeHtml(service.name)}</div>
        <div class="service-category">${escapeHtml(service.category)} · ${escapeHtml(service.url)}</div>
      </div>
      <div class="status-badge">
        <span class="dot ${statusDotClass(service.status)}"></span>
        ${escapeHtml(service.status)}
      </div>
      <div class="muted">${Number(service.latencyMs || 0)} ms</div>
    </div>
  `).join("");

  const lastUpdate = nowPlaying.updatedAt
    ? new Date(nowPlaying.updatedAt).toLocaleString("es-ES")
    : "Sin datos";

  sendPublicHtml(res, `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>StreamOps Admin</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="shell">
    <section class="topbar">
      <div>
        <div class="brand-kicker">StreamOps / Control Plane</div>
        <h1>Admin Panel</h1>
        <p class="subtitle">
          Panel privado para operar Mate and Cloud: estado del stack, rutas principales,
          overlay de música y endpoints de interacción.
        </p>
      </div>
      <div class="pill">
        <span class="dot ${statusDotClass(stackStatus.status)}"></span>
        ${escapeHtml(getStatusLabel(stackStatus.status))}
      </div>
    </section>

    <section class="grid">
      <article class="card span-4">
        <div class="metric">Servicio</div>
        <div class="metric-value">StreamOps</div>
        <p class="muted">Overlay automation service</p>
      </article>

      <article class="card span-4">
        <div class="metric">Uptime</div>
        <div class="metric-value">${uptimeHours}h ${uptimeMinutes % 60}m</div>
        <p class="muted">${uptimeSeconds} segundos en ejecución</p>
      </article>

      <article class="card span-4">
        <div class="metric">Runtime</div>
        <div class="metric-value">Node.js</div>
        <p class="muted">${escapeHtml(process.version)}</p>
      </article>

      <article class="card span-8">
        <div class="metric">Stack Health</div>
        ${servicesHtml}
      </article>

      <article class="card span-4">
        <div class="metric">Resumen</div>
        <div class="metric-value">${stackStatus.summary.healthy}/${stackStatus.summary.total}</div>
        <p class="muted">Servicios saludables</p>
        <p class="muted">Degraded: ${stackStatus.summary.degraded} · Down: ${stackStatus.summary.down}</p>
      </article>

      <article class="card span-6">
        <div class="metric">Now Playing</div>
        <div class="metric-value">${escapeHtml(nowPlaying.title)}</div>
        <p class="muted">Artist: ${escapeHtml(nowPlaying.artist)}</p>
        <p class="muted">Playing: ${nowPlaying.isPlaying ? "yes" : "no"} · Progress: ${Number(nowPlaying.progress || 0)}%</p>
        <p class="muted">Última actualización: ${escapeHtml(lastUpdate)}</p>
      </article>

      <article class="card span-6">
        <div class="metric">Seguridad</div>
        <div class="metric-value">Tokens ocultos</div>
        <p class="muted">Admin, view y write tokens no se muestran en pantalla.</p>
        <p class="muted">Cloudflare Tunnel token, puertos internos y datos de Docker no se exponen.</p>
      </article>

      <article class="card span-12">
        <div class="metric">Available Routes</div>
        ${routesHtml}
      </article>

      <article class="card span-12">
        <div class="metric">System Check</div>
        <p class="muted">● service: online</p>
        <p class="muted">● admin auth: enabled</p>
        <p class="muted">● view token: ${VIEW_TOKEN ? "enabled" : "disabled"}</p>
        <p class="muted">● write token: ${WRITE_TOKEN ? "enabled" : "disabled"}</p>
        <p class="muted">● overlay: protected</p>
        <p class="muted">● public status: sanitized</p>
      </article>
    </section>

    <footer class="footer">
      <span>Mate and Cloud · Powered by T28 / Built on StreamOps</span>
      <span>Admin view · Do not share this URL</span>
    </footer>
  </main>
</body>
</html>`);
}

const server = http.createServer(async (req, res) => {
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

  if (req.method === "GET" && url.pathname === "/api/status") {
    if (!hasAdminAccess(url, req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const stackStatus = await getStackStatus();
    sendJson(res, 200, stackStatus);
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    const stackStatus = await getStackStatus();

    if (url.searchParams.get("format") === "json") {
      sendPublicJson(res, 200, sanitizeStatusForPublic(stackStatus));
      return;
    }

    sendPublicHtml(res, renderStatusPage(stackStatus, { publicOnly: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/overlay/status") {
    if (!hasViewAccess(url)) {
      sendText(res, 401, "Unauthorized");
      return;
    }

    const stackStatus = await getStackStatus();
    sendPublicHtml(res, renderOverlayStatus(stackStatus));
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin") {
    if (!hasAdminAccess(url, req)) {
      sendText(res, 401, "Unauthorized");
      return;
    }

    await sendAdminPanel(res);
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
