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

The SDK requires DCAP collateral by default. For a legacy non-production coordinator that does not emit collateral yet, set `INVISIBLE_ALLOW_MISSING_DCAP_COLLATERAL=true`. The example rejects that flag in `prod` mode.

The bot uses Telegram Bot API webhooks or long polling. Invisible coordinator traffic stays server-side over WebSocket. This example only accepts `buy SOL`; other assets or sides are intentionally rejected.
