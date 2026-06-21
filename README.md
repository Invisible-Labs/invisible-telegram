# Invisible Telegram

Classic Telegram bot example for server-side Invisible private transfers.

```bash
git clone git@github.com:Invisible-Labs/invisible-telegram.git
cd invisible-telegram
git checkout rami/telegram-sdk-example
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

## Bot Flow

- `/start` opens the trading menu.
- `Private transfer` opens a short-lived server-side Invisible session.
- `Buy SOL privately` submits the demo private-transfer intent.
- `/lp create` creates an LP position and returns the LP Position Code.
- `/lp recover <position-code>` refreshes an LP position through the SDK.
- `/lp dkg <position-code>` completes the SDK-owned DKG batch.
- `/lp funding <position-code>` returns the LP_DKG_0 funding instruction.
- `/lp reconcile <position-code>`, `/lp refill <position-code>`, and `/lp withdraw <position-code> <destination>` call the matching SDK LP actions.
- `Back to trading` or `Close` closes the private-transfer session.
- Inactivity closes the private-transfer session after one hour.
- `Contact us` links to the Invisible Telegram chat for teams that want a hosted or deeper integration.

The Telegram menu does not expose transport details to users. The server owns the Invisible connection lifecycle so abandoned Telegram sessions do not keep resources open indefinitely.

## Local Test With BotFather

1. Create a bot in BotFather and copy its token.
2. Set `TELEGRAM_BOT_TOKEN=<token>` in `.env`.
3. Keep `ENABLE_POLLING=true` and leave `WEBHOOK_URL=` empty for local testing.
4. Fill the `INVISIBLE_*` coordinator values.
5. Run:

```bash
npm run telegram:delete-webhook
npm run dev
```

Open the bot in Telegram, send `/start`, enter `Private transfer`, then use `Buy SOL privately`.

## Deployed Webhook Mode

Deploy this Node service on any HTTPS host that can run `npm run start`.

Runtime environment:

```txt
TELEGRAM_BOT_TOKEN=<botfather-token>
WEBHOOK_URL=https://<your-public-host>/webhook
TELEGRAM_WEBHOOK_SECRET=<random-secret>
ENABLE_POLLING=false
INVISIBLE_COORDINATOR_WS_URL=<coordinator-ws-url>
INVISIBLE_REQUIRED_MODE=prod
INVISIBLE_RELEASE_MRTD=<release-mrtd>
INVISIBLE_INTEL_ROOT_FINGERPRINT=<intel-root-fingerprint>
```

After deployment:

```bash
npm run telegram:set-webhook
```

Telegram sends webhook updates to `WEBHOOK_URL` and includes `TELEGRAM_WEBHOOK_SECRET` as the webhook secret token.

## SDK Compatibility

The SDK requires DCAP collateral by default. Production examples need a coordinator release that matches the SDK wire contract and emits production TDX attestation collateral. For local/dev previews only, `INVISIBLE_ALLOW_MISSING_DCAP_COLLATERAL=true` maps to `releasePin.allowMissingDcapCollateral` and is rejected in `prod` mode.

If the configured coordinator is still on an older wire contract, this preview can fail before a transfer is created. Once the matching coordinator and wire-contract rollout is live, the SDK package and coordinator will speak the same message names and payload shapes.

The bot uses Telegram Bot API webhooks or long polling. Invisible coordinator traffic stays server-side over WebSocket. This example only accepts `buy SOL`; other assets or sides are intentionally rejected.

## State And History

This example does not persist transfer codes, recovery codes, sync secrets, or LP codes. Integrators that want to redisplay user transfer state, history, or LP state must store the SDK-returned codes they need for their own UX. Without those codes, the coordinator cannot reconstruct that history for the integrator. Storing less data is better for privacy, but may degrade UX.

`npm run verify:sdk` installs `@invisible/sdk@npm:@invisible-labs/sdk@0.1.0-dev.1.2` in a temporary consumer project when `INVISIBLE_SDK_PACKAGE` is unset. It allows freshly published private dev packages for that temporary install only, and must pass from the published or packaged SDK artifact, not from local monorepo paths or generated FROST files.
