import type { CoordinatorPoolConfig } from "@invisible-labs/sdk";
import { invisibleDev, invisibleProd } from "@invisible-labs/sdk/presets";

const COORDINATOR_POOL_ENV = "INVISIBLE_COORDINATOR_POOL_JSON";
const COORDINATOR_PRESET_ENV = "INVISIBLE_COORDINATOR_PRESET";
const PROD_PRESET = "prod";

type Env = Record<string, string | undefined>;

export function loadCoordinatorPool(env: Env = process.env): CoordinatorPoolConfig {
  const rawPool = env[COORDINATOR_POOL_ENV];
  if (rawPool !== undefined && rawPool.trim().length > 0) {
    return JSON.parse(rawPool) as CoordinatorPoolConfig;
  }

  const preset = env[COORDINATOR_PRESET_ENV] ?? "dev";
  return {
    endpoints: preset === PROD_PRESET ? invisibleProd() : invisibleDev(),
  };
}

export function mutationsEnabled(env: Env = process.env): boolean {
  return env.INVISIBLE_ENABLE_MUTATIONS === "true";
}
