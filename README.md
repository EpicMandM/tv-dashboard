# TV Dashboard

Ambient 1080p dashboard for a Samsung Tizen 5.5 TV (Chromium 69).

```bash
bun install
bun run dev          # http://localhost:5173
bun run deploy       # build, sign, install, launch
```

`bun run package` writes a signed `.wgt`. `bun run launch` restarts the installed app.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/tv` | Dashboard snapshot |
| `POST` | `/actions/:id` | Run an action |

```json
{
  "summary": "Сегодня нет срочных дел.",
  "actions": [
    { "id": "plan-tomorrow", "title": "План на завтра" },
    { "id": "what-missed", "title": "Что я упустил?" }
  ],
  "status": "ready"
}
```

`VITE_API_BASE_URL` in `.env.production` points the TV build at the API host. Empty uses the Vite mock.

## TV

Developer Mode on the TV, then `sdb`. Certificates default to `~/tizen-studio-data/SamsungCertificate/Tizen/` and `~/.samsung-tv-cert-password`. Override with `TV_IP`, `SDB`, `CERT_DIR`, `CERT_PASSWORD_FILE`.
