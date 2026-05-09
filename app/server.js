const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3033);
const WRITE_TOKEN = process.env.WRITE_TOKEN || "";
const VIEW_TOKEN = process.env.VIEW_TOKEN || "";

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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

const server = http.createServer((req, res) => {
  const url = parseUrl(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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
      updatedAt: new Date().toISOString()
    });
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
