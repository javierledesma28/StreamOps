
### `MEMORY.md`

```md
# StreamOps Memory

## Project Context

StreamOps was created as a backend for the Mate and Cloud technology stream.

The first feature is a SoundCloud now-playing overlay synchronized with the track currently playing in a normal browser tab.

## Current Working State

- The service runs on Ubuntu Server using Docker Compose.
- The service is exposed through a dedicated Cloudflare Tunnel.
- The public hostname is `streamops.t28.io`.
- Streamlabs consumes the overlay through a Browser Source.
- Tampermonkey sends SoundCloud state to the backend.

## Important Decisions

- Do not run the Node.js bridge locally on the laptop.
- Do not use the SoundCloud PWA because Tampermonkey does not reliably inject there.
- SoundCloud must be opened in a normal Chrome/Edge browser tab.
- StreamOps has its own Cloudflare Tunnel container: `streamops-cloudflared`.
- StreamOps does not reuse existing `cloudflared` or `ghost-cloudflared` containers.
- The project uses token-based protection:
  - `WRITE_TOKEN` for Tampermonkey POSTs.
  - `VIEW_TOKEN` for Streamlabs overlay/API reads.

## Security Notes

- `config/.env` contains secrets and must never be committed.
- Tokens seen during setup should be rotated before production.