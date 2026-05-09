# StreamOps - Claude Operating Guide

## Project Purpose

StreamOps is the operational backend for the Mate and Cloud stream. It provides lightweight APIs and browser overlays for live stream automation, starting with SoundCloud now-playing synchronization.

## Current Scope

- Receive now-playing data from SoundCloud via Tampermonkey.
- Store the current track state in memory.
- Expose a minimal browser overlay for Streamlabs.
- Run as a Dockerized service behind Cloudflare Tunnel.
- Use `streamops.t28.io` as the technical backend endpoint.

## Architecture

SoundCloud browser tab  
→ Tampermonkey userscript  
→ `POST /api/nowplaying`  
→ StreamOps Docker service  
→ `GET /overlay/music`  
→ Streamlabs Browser Source

## Important Rules

- Do not commit secrets.
- `config/.env` must remain local and ignored by Git.
- Use `config/.env.example` as the public template.
- Do not modify other Docker stacks on the host.
- Do not touch existing containers: `cloudflared`, `ghost-cloudflared`, `ai-platform`, `ghost-blog`, or related services.
- StreamOps must remain isolated in its own Docker Compose stack and network.

## Runtime

Main project path on server:

```bash
/home/javierledesma/docker/streamops