import { readConfig } from "../src/config.js";
import { buildCoordinatorPool } from "../src/sdk.js";

const baseEnv = {
  TELEGRAM_BOT_TOKEN: "test-token",
  INVISIBLE_COORDINATOR_WS_URL: "wss://coordinator.example/ws-noise",
  INVISIBLE_REQUIRED_MODE: "dev",
  INVISIBLE_RELEASE_MRTD:
    "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  INVISIBLE_INTEL_ROOT_FINGERPRINT:
    "0000000000000000000000000000000000000000000000000000000000000000",
} satisfies NodeJS.ProcessEnv;

const pool = buildCoordinatorPool(readConfig(baseEnv));
const pin = pool.endpoints[0]?.releasePin;
if (!pin?.mrtd || !pin.intelRootFingerprint) {
  throw new Error("coordinator release pin must include mrtd and intelRootFingerprint");
}

try {
  readConfig({ ...baseEnv, WEBHOOK_URL: "https://example.com/webhook" });
  throw new Error("webhook mode must require TELEGRAM_WEBHOOK_SECRET");
} catch (error) {
  if (error instanceof Error && error.message.includes("TELEGRAM_WEBHOOK_SECRET")) {
    console.log("telegram contract ok");
  } else {
    throw error;
  }
}
