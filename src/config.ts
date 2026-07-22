import type { CoordinatorPoolConfig } from "@invisible-labs/sdk";

const ENV_KEYS = {
  BACKEND_API_TOKEN: "BACKEND_API_TOKEN",
  BACKEND_HOSTPORT: "BACKEND_HOSTPORT",
  BACKEND_PORT: "BACKEND_PORT",
  BACKEND_URL: "BACKEND_URL",
  COORDINATOR_ALLOW_MISSING_DCAP_COLLATERAL:
    "COORDINATOR_ALLOW_MISSING_DCAP_COLLATERAL",
  COORDINATOR_AZURE_MAA_ISSUER: "COORDINATOR_AZURE_MAA_ISSUER",
  COORDINATOR_AZURE_MAA_JWKS_URL: "COORDINATOR_AZURE_MAA_JWKS_URL",
  COORDINATOR_AZURE_MAA_POLICY_HASH: "COORDINATOR_AZURE_MAA_POLICY_HASH",
  COORDINATOR_EXPECTED_HOSTNAME: "COORDINATOR_EXPECTED_HOSTNAME",
  COORDINATOR_INTEL_ROOT_FINGERPRINT: "COORDINATOR_INTEL_ROOT_FINGERPRINT",
  COORDINATOR_MRTD: "COORDINATOR_MRTD",
  COORDINATOR_REQUIRED_MODE: "COORDINATOR_REQUIRED_MODE",
  COORDINATOR_WS_URL: "COORDINATOR_WS_URL",
  PORT: "PORT",
  TELEGRAM_BOT_TOKEN: "TELEGRAM_BOT_TOKEN",
  RENDER_EXTERNAL_URL: "RENDER_EXTERNAL_URL",
  TELEGRAM_WEBHOOK_SECRET: "TELEGRAM_WEBHOOK_SECRET",
  TELEGRAM_WEBHOOK_URL: "TELEGRAM_WEBHOOK_URL",
} as const;

const DEFAULT_BACKEND_HOST = "0.0.0.0";
const DEFAULT_BACKEND_PORT = 3000;
const LOCAL_BACKEND_URL_PREFIX = "http://127.0.0.1:";
const DEFAULT_REMOTE_COORDINATOR_MODE = "prod";
const HTTP_PROTOCOL = "http://";
const HTTPS_PROTOCOL = "https:";
const WEBHOOK_URL_ERROR =
  "TELEGRAM_WEBHOOK_URL or RENDER_EXTERNAL_URL must be a valid HTTPS URL";
const MIN_PORT = 1;
const MAX_PORT = 65535;
const REQUIRED_COORDINATOR_MODES = ["prod", "dev", "auto"] as const;

type RequiredCoordinatorMode = (typeof REQUIRED_COORDINATOR_MODES)[number];

const LOCAL_COORDINATOR_CONFIG: CoordinatorPoolConfig = {
  endpoints: [
    {
      wsUrl: "ws://127.0.0.1:8765/ws-noise",
      expectedHostname: "127.0.0.1",
      releasePin: {
        mrtd: "local-dev",
      },
      requiredMode: "dev",
      allowLocalAttestation: true,
    },
  ],
};

const backendPort = parsePort();

export const config = {
  backendHost: DEFAULT_BACKEND_HOST,
  backendPort,
  backendUrl: getBackendUrl(backendPort),
};

/**
 * Build the coordinator endpoint configuration when the backend first needs
 * the SDK. Keeping this lazy lets the Telegram process use the same config
 * module without receiving coordinator trust material.
 */
export function getCoordinatorConfig(): CoordinatorPoolConfig {
  const wsUrl = process.env[ENV_KEYS.COORDINATOR_WS_URL];
  if (wsUrl === undefined) return LOCAL_COORDINATOR_CONFIG;

  const requiredMode = parseRequiredCoordinatorMode(
    process.env[ENV_KEYS.COORDINATOR_REQUIRED_MODE] ??
      DEFAULT_REMOTE_COORDINATOR_MODE,
  );
  const intelRootFingerprint = getOptionalEnvironmentVariable(
    ENV_KEYS.COORDINATOR_INTEL_ROOT_FINGERPRINT,
  );
  const azureMaa = getAzureMaaPin();
  const allowMissingDcapCollateral = parseOptionalBoolean(
    process.env[ENV_KEYS.COORDINATOR_ALLOW_MISSING_DCAP_COLLATERAL],
    ENV_KEYS.COORDINATOR_ALLOW_MISSING_DCAP_COLLATERAL,
  );

  return {
    endpoints: [
      {
        wsUrl: requireNonEmptyValue(wsUrl, ENV_KEYS.COORDINATOR_WS_URL),
        expectedHostname: requireEnvironmentVariable(
          ENV_KEYS.COORDINATOR_EXPECTED_HOSTNAME,
        ),
        releasePin: {
          mrtd: requireEnvironmentVariable(ENV_KEYS.COORDINATOR_MRTD),
          ...(intelRootFingerprint === undefined
            ? {}
            : { intelRootFingerprint }),
          ...(allowMissingDcapCollateral === undefined
            ? {}
            : { allowMissingDcapCollateral }),
          ...(azureMaa === undefined ? {} : { azureMaa }),
        },
        requiredMode,
      },
    ],
  };
}

export function getTelegramBotToken(): string {
  return requireEnvironmentVariable(ENV_KEYS.TELEGRAM_BOT_TOKEN);
}

/**
 * Return the public HTTPS origin used for Telegram webhooks.
 *
 * Render provides `RENDER_EXTERNAL_URL` automatically for web services. The
 * explicit `TELEGRAM_WEBHOOK_URL` override keeps local tunnel testing
 * possible without coupling local development to Render.
 */
export function getTelegramWebhookBaseUrl(): string | undefined {
  const configuredUrl =
    getOptionalEnvironmentVariable(ENV_KEYS.TELEGRAM_WEBHOOK_URL) ??
    getOptionalEnvironmentVariable(ENV_KEYS.RENDER_EXTERNAL_URL);
  if (configuredUrl === undefined) return undefined;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(WEBHOOK_URL_ERROR);
  }

  if (parsedUrl.protocol !== HTTPS_PROTOCOL) {
    throw new Error(WEBHOOK_URL_ERROR);
  }

  return parsedUrl.origin;
}

export function getTelegramWebhookSecret(): string | undefined {
  return getOptionalEnvironmentVariable(ENV_KEYS.TELEGRAM_WEBHOOK_SECRET);
}

export function getBackendApiToken(): string {
  return requireEnvironmentVariable(ENV_KEYS.BACKEND_API_TOKEN);
}

function requireEnvironmentVariable(name: string): string {
  return requireNonEmptyValue(process.env[name], name);
}

function requireNonEmptyValue(value: string | undefined, name: string): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) throw new Error(`Missing ${name}`);
  return trimmedValue;
}

function getOptionalEnvironmentVariable(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parsePort(): number {
  const configuredValue =
    process.env[ENV_KEYS.PORT] ?? process.env[ENV_KEYS.BACKEND_PORT];
  if (configuredValue === undefined) return DEFAULT_BACKEND_PORT;

  const port = Number(configuredValue);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `${ENV_KEYS.PORT} or ${ENV_KEYS.BACKEND_PORT} must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
    );
  }

  return port;
}

function getBackendUrl(port: number): string {
  const explicitUrl = getOptionalEnvironmentVariable(ENV_KEYS.BACKEND_URL);
  if (explicitUrl) return explicitUrl;

  const privateHostPort = getOptionalEnvironmentVariable(
    ENV_KEYS.BACKEND_HOSTPORT,
  );
  if (privateHostPort) return `${HTTP_PROTOCOL}${privateHostPort}`;

  return `${LOCAL_BACKEND_URL_PREFIX}${port}`;
}

function parseRequiredCoordinatorMode(value: string): RequiredCoordinatorMode {
  if (!REQUIRED_COORDINATOR_MODES.includes(value as RequiredCoordinatorMode)) {
    throw new Error(
      `${ENV_KEYS.COORDINATOR_REQUIRED_MODE} must be one of ${REQUIRED_COORDINATOR_MODES.join(", ")}`,
    );
  }
  return value as RequiredCoordinatorMode;
}

function parseOptionalBoolean(
  value: string | undefined,
  name: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function getAzureMaaPin():
  | {
      issuer: string;
      jwksUrl: string;
      policyHash: string;
    }
  | undefined {
  const issuer = process.env[ENV_KEYS.COORDINATOR_AZURE_MAA_ISSUER];
  const jwksUrl = process.env[ENV_KEYS.COORDINATOR_AZURE_MAA_JWKS_URL];
  const policyHash = process.env[ENV_KEYS.COORDINATOR_AZURE_MAA_POLICY_HASH];
  const configuredValues = [issuer, jwksUrl, policyHash].filter(
    (value) => value !== undefined,
  );

  if (configuredValues.length === 0) return undefined;
  if (configuredValues.length !== 3) {
    throw new Error(
      `All Azure MAA coordinator pin values are required: ${ENV_KEYS.COORDINATOR_AZURE_MAA_ISSUER}, ${ENV_KEYS.COORDINATOR_AZURE_MAA_JWKS_URL}, ${ENV_KEYS.COORDINATOR_AZURE_MAA_POLICY_HASH}`,
    );
  }

  return {
    issuer: requireNonEmptyValue(issuer, ENV_KEYS.COORDINATOR_AZURE_MAA_ISSUER),
    jwksUrl: requireNonEmptyValue(
      jwksUrl,
      ENV_KEYS.COORDINATOR_AZURE_MAA_JWKS_URL,
    ),
    policyHash: requireNonEmptyValue(
      policyHash,
      ENV_KEYS.COORDINATOR_AZURE_MAA_POLICY_HASH,
    ),
  };
}
