# TV Dashboard

Full-screen remote for a Samsung Tizen TV (Tizen 5.5 / Chromium 69). It shows a day plan and a few buttons; a separate host API supplies the data.

This repo is only the TV widget. The API on `:8787` and Home Assistant live elsewhere.

## Quick start

```bash
bun install
bun run dev    # browser + mock API from data/tv.json
```

Leave `VITE_API_BASE_URL` empty in `.env` for the mock. Edit `data/tv.json` to change what you see.

## Commands

| Command | What it does |
|---------|----------------|
| `bun run dev` | Local UI + mock API |
| `bun run lint` | Oxlint |
| `bun run build` | Build the TV widget |
| `bun run package` | Signed `.wgt` |
| `bun run deploy` | Build, sign, install, launch on the TV |
| `bun run launch` | Launch the installed app |

## Talk to a real host

For a TV build, set the host in `.env.production`:

```bash
VITE_API_BASE_URL=http://HOST:8787
```

Without that, the widget calls itself and gets nothing useful.

Copy `.env.example` for the rest:

- `TV_IP` — TV address (`scripts/tv.js`)
- optional: `SDB`, `CERT_DIR`, `CERT_PASSWORD_FILE`

Packaging needs `sdb`, `zip`, and Samsung p12 certs.

## Host API

| Call | Role |
|------|------|
| `GET /tv` | Current screen (summary, columns, actions) |
| `POST /actions/:id` | Run a button → `204` |
| `home` | Back |

Cached actions like `plan-tomorrow` / `what-missed` switch the view. Everything else: host sets `running`, then the result.
