import "dotenv/config";

export type RequiredMode = "dev" | "prod" | "auto";

export type AppConfig = {
  telegramBotToken: string;
  webhookUrl: string | null;
  telegramWebhookSecret: string | null;
  port: number;
  enablePolling: boolean;
  invisibleCoordinatorWsUrl: string;
  invisibleRequiredMode: RequiredMode;
  invisibleReleaseMrtd: string;
  invisibleIntelRootFingerprint: string;
  demoMint: string;
  demoAmountSol: string;
  demoDestinationAddress: string;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const webhookUrl = readOptional(env, "WEBHOOK_URL");
  const telegramWebhookSecret = readOptional(env, "TELEGRAM_WEBHOOK_SECRET");
  if (webhookUrl && !telegramWebhookSecret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required when WEBHOOK_URL is set");
  }

  return {
    telegramBotToken: readRequired(env, "TELEGRAM_BOT_TOKEN"),
    webhookUrl,
    telegramWebhookSecret,
    port: readPort(env.PORT),
    enablePolling: readBoolean(env.ENABLE_POLLING, true),
    invisibleCoordinatorWsUrl: readRequired(env, "INVISIBLE_COORDINATOR_WS_URL"),
    invisibleRequiredMode: readMode(env.INVISIBLE_REQUIRED_MODE),
    invisibleReleaseMrtd: readRequired(env, "INVISIBLE_RELEASE_MRTD"),
    invisibleIntelRootFingerprint: readRequired(env, "INVISIBLE_INTEL_ROOT_FINGERPRINT"),
    demoMint: readOptional(env, "DEMO_MINT") ?? "SOL",
    demoAmountSol: readOptional(env, "DEMO_AMOUNT_SOL") ?? "0.1",
    demoDestinationAddress: readOptional(env, "DEMO_DESTINATION_ADDRESS") ?? "",
  };
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptional(env, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer in 1..65535");
  }
  return port;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function readMode(value: string | undefined): RequiredMode {
  if (value === "dev" || value === "prod" || value === "auto") return value;
  throw new Error("INVISIBLE_REQUIRED_MODE must be dev, prod, or auto");
}
