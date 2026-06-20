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

The SDK requires DCAP collateral by default. Production examples need a coordinator that emits `dcap_collateral` or a compatible attestation manifest. For legacy previews only, set `INVISIBLE_ALLOW_MISSING_DCAP_COLLATERAL=true`; this maps to `releasePin.allowMissingDcapCollateral` and is rejected in `prod` mode.

If the configured coordinator is still on an older wire contract, this preview can fail before a transfer is created. Once the matching coordinator and wire-contract rollout is live, the SDK package and coordinator will speak the same message names and payload shapes.

The bot uses Telegram Bot API webhooks or long polling. Invisible coordinator traffic stays server-side over WebSocket. This example only accepts `buy SOL`; other assets or sides are intentionally rejected.

`npm run verify:sdk` installs `@invisible/sdk` in a temporary consumer project. It must pass from the published or packaged SDK artifact, not from local monorepo paths or generated FROST files.
