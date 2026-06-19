# Invisible Telegram

Classic Telegram bot example for server-side Invisible private transfers.

```bash
cp .env.example .env
npm ci
npm run dev
```

Use polling locally. Use `WEBHOOK_URL` in production.

Required:

```txt
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
INVISIBLE_COORDINATOR_WS_URL=
INVISIBLE_RELEASE_MRTD=
INVISIBLE_INTEL_ROOT_FINGERPRINT=
```

The bot uses Telegram Bot API webhooks or long polling. Invisible coordinator traffic stays server-side over WebSocket.
