# Invisible Telegram

Simple Telegram bot example for Invisible SDK integrations.

## Run

Use Node.js 22 or newer, export a GitHub Packages read token as described below,
create a `.env` file from `.env.example`, and set the Telegram token and a
shared local backend token.

```text
TELEGRAM_BOT_TOKEN=your_bot_token
BACKEND_API_TOKEN=replace_with_a_local_shared_token
BACKEND_URL=http://127.0.0.1:3000
BACKEND_PORT=3000
```

Run the backend in one terminal:

```bash
npm ci
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

To run the Render-shaped single-process service locally, use the same `.env`
file and run:

```bash
npm run dev:render
```

Without a public HTTPS URL, this mode uses Telegram long polling. With
`TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET` set, it uses the webhook
path `/telegram/webhook` instead.

## Render

`render.yaml` defines one Free web service:

- `invisible-telegram-demo`: an Express web service that hosts the backend API
  and the Telegram webhook in one Node.js process.

Create a Render Blueprint from this repository and select `render.yaml`. During
the first setup, provide the `sync: false` values shown in
[.env.render.example](./.env.render.example). Render generates the backend API
token automatically. Render also provides `RENDER_EXTERNAL_URL` automatically;
the service registers `${RENDER_EXTERNAL_URL}/telegram/webhook` with Telegram
at startup.
Do not configure `BACKEND_URL` or `BACKEND_HOSTPORT` on Render; the bot calls
the backend over the same service's loopback port.

The Blueprint uses Node.js 22, `npm ci && npm run build`, and
`npm run start:render`. The service listens on `0.0.0.0:10000` and exposes
`/healthz`. Local development still supports `BACKEND_PORT` as a fallback.

The Telegram webhook secret must contain only letters, numbers, `_`, or `-`.
Generate one locally with `openssl rand -hex 32`, then provide it to Render.
The in-memory transfer store and transfer pollers are demo limitations: Free
Render services can sleep or restart, which loses active transfer records and
pollers. Add durable storage and a durable job/notification mechanism before
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

Render must provide `NODE_AUTH_TOKEN` to the web service so its `npm ci` build
command can install the private package.
