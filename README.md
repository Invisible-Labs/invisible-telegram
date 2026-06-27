# Invisible Telegram

Telegram bot example for `@invisible-labs/sdk`.

It demonstrates the current SDK basics:

- attested session open, re-attestation, close
- normal-user private transfer, status restore, refund intent
- LP lifecycle entrypoints: create, recover, DKG, funding, refill, withdraw
- local storage, recovery-code helpers, derived refundable amount
- coordinator-pending surfaces are imported and kept explicit

## Install

The SDK is currently private on GitHub Packages.

```bash
export NODE_AUTH_TOKEN=<github-token-with-read:packages>
npm ci
```

If npm is not already configured for GitHub Packages:

```bash
npm config set //npm.pkg.github.com/:_authToken "$NODE_AUTH_TOKEN"
```

## Run

```bash
cp .env.example .env
npm run dev
```

Safe commands:

- `/sdk`: local SDK utilities only
- `/attest`: opens and closes an attested SDK session

Mutating commands are blocked unless `INVISIBLE_ENABLE_MUTATIONS=true`.

## Validate

```bash
npm run typecheck
npm run build
npm test
```
