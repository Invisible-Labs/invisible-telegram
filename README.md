# Invisible Telegram

Simple Telegram bot example for Invisible SDK integrations.

## Run

Use Node.js 22 or newer, create a `.env` file from `.env.example`, and set the
Telegram token and a shared local backend token.

```text
TELEGRAM_BOT_TOKEN=your_bot_token
BACKEND_API_TOKEN=replace_with_a_local_shared_token
BACKEND_URL=http://127.0.0.1:3000
BACKEND_PORT=3000
```

Run the backend in one terminal:

```bash
npm install
npm run typecheck
npm run dev:backend
```

Run the Telegram bot in another terminal:

```bash
npm run dev:telegram
```

The bot calls the backend over HTTP. The backend owns the Invisible SDK session
and the demo transfer records. After a transfer or refund request, the bot polls
status every five seconds and updates the progress message automatically. The
backend opens the coordinator session lazily on the first SDK action and closes
it after five minutes without SDK traffic.

## Render

`render.yaml` defines two services:

- `invisible-telegram-backend`: an Express web service with the `/healthz`
  health check.
- `invisible-telegram-bot`: a background worker that polls Telegram and calls
  the backend over Render's private network.

Create a Render Blueprint from this repository and select `render.yaml`. During
the first setup, provide the `sync: false` values shown in
[.env.render.example](./.env.render.example). Render generates the backend API
token and shares it with the worker automatically. The worker uses the backend's
private `hostport`, so no public backend URL is needed.

The Blueprint uses Node.js 22 and `npm ci && npm run build`. Render web services
must listen on `0.0.0.0` and the configured `PORT`. The Blueprint uses port
`10001` because Render reserves port `10000` for private-network traffic. Local
development still supports `BACKEND_PORT` as a fallback.

The Telegram worker uses a paid Render plan because Render does not offer free
background workers. The in-memory transfer store is a demo limitation: a service
restart or deploy loses active transfer records. Add durable storage before
treating this as a production deployment.

### SDK package requirement

The bot consumes the published private `@invisible-labs/sdk` package. The project
`.npmrc` maps the `@invisible-labs` scope to GitHub Packages and reads the token
from `NODE_AUTH_TOKEN`.

For local installation, export a GitHub Packages read token before running npm:

```bash
export NODE_AUTH_TOKEN=your_github_packages_read_token
npm ci
```

The lockfile pins the SDK version used by the bot. Update it explicitly when a
new private `dev` package should be tested:

```bash
npm install --save-exact @invisible-labs/sdk@dev
```

Render must provide the same `NODE_AUTH_TOKEN` secret to both services so their
`npm ci` build commands can install the private package.
