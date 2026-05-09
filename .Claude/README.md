# StreamOps

Backend operativo para overlays, comandos y automatizaciones del stream Mate and Cloud.

## Current Features

- SoundCloud now-playing API.
- Minimal music overlay for Streamlabs.
- Dockerized Node.js service.
- Dedicated Cloudflare Tunnel.
- Token-based read/write protection.

## Endpoints

```text
GET  /health
GET  /api/nowplaying?token=<VIEW_TOKEN>
POST /api/nowplaying?token=<WRITE_TOKEN>
GET  /overlay/music?token=<VIEW_TOKEN>