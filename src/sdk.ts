import type { AppConfig } from "./config.js";
import { solToLamports } from "./format.js";

type SdkSession = { readonly attested?: boolean };
type SdkRoot = {
  createSession(options: {
    coordinator: CoordinatorPoolConfig;
    storage?: unknown;
    wallet?: unknown;
  }): Promise<SdkSession>;
  closeSession?(session: SdkSession): void;
  normalizeError?(error: unknown, fallback?: string): string;
};
type SdkUser = {
  contractRequest(
    session: SdkSession,
    args: {
      amountLamports: number;
      payoutPolicy: PayoutPolicy;
      sync?: boolean;
    },
  ): Promise<AcceptanceReceipt>;
};
type SdkStorage = {
  inMemoryStorage?(): unknown;
};

export type CoordinatorPoolConfig = {
  endpoints: Array<{
    wsUrl: string;
    expectedHostname: string;
    requiredMode: "dev" | "prod" | "auto";
    releasePin: {
      mrtd: string;
      intelRootFingerprint: string;
      allowMissingDcapCollateral?: boolean;
    };
  }>;
  allowedRoles?: string[];
  preferLeader?: boolean;
};

export type PayoutPolicy = {
  destinations: Array<{
    address: string;
    sharePercent: number;
  }>;
};

export type AcceptanceReceipt = {
  accepted?: boolean;
  requestId?: string;
  request_id?: string;
};

export type PrivateTransferInput = {
  side: "buy" | "sell";
  mint: string;
  amountSol: string;
  destinationAddress: string;
};

export type PrivateTransferResult =
  | { kind: "accepted"; requestId: string }
  | { kind: "sdk-missing"; message: string }
  | { kind: "sdk-not-ready"; message: string }
  | { kind: "failed"; message: string };

export type PrivateTransferSession =
  | {
      kind: "ready";
      startPrivateTransfer(input: PrivateTransferInput): Promise<PrivateTransferResult>;
      close(): void;
    }
  | { kind: "unavailable"; message: string };

export type InvisibleClient = {
  openPrivateTransferSession(): Promise<PrivateTransferSession>;
  startPrivateTransfer(input: PrivateTransferInput): Promise<PrivateTransferResult>;
};

export function createInvisibleClient(config: AppConfig): InvisibleClient {
  return {
    async openPrivateTransferSession() {
      const sdk = await loadSdk();
      if (!sdk) {
        return {
          kind: "unavailable",
          message: "Install @invisible/sdk from the private package registry before running this bot.",
        } satisfies PrivateTransferSession;
      }

      try {
        const session = await sdk.root.createSession({
          coordinator: buildCoordinatorPool(config),
          storage: sdk.storage.inMemoryStorage?.(),
        });

        return {
          kind: "ready",
          async startPrivateTransfer(input) {
            const receipt = await sdk.user.contractRequest(session, {
              amountLamports: solToLamports(input.amountSol),
              payoutPolicy: singleDestinationPolicy(input.destinationAddress),
              sync: true,
            });

            return {
              kind: "accepted",
              requestId: receipt.requestId ?? receipt.request_id ?? "accepted",
            };
          },
          close() {
            sdk.root.closeSession?.(session);
          },
        } satisfies PrivateTransferSession;
      } catch (error) {
        const message = normalizeSdkError(sdk.root, error);
        if (message.includes("NOT_ATTESTED") || message.includes("not attested")) {
          return {
            kind: "unavailable",
            message: "SDK connected, but this package build has not completed coordinator attestation yet.",
          } satisfies PrivateTransferSession;
        }
        if (message.includes("NOT_IMPLEMENTED") || message.includes("not implemented")) {
          return {
            kind: "unavailable",
            message: "SDK package is installed, but this command is still preview-only in the current build.",
          } satisfies PrivateTransferSession;
        }
        return { kind: "unavailable", message } satisfies PrivateTransferSession;
      }
    },
    async startPrivateTransfer(input) {
      const session = await this.openPrivateTransferSession();
      if (session.kind === "unavailable") {
        return { kind: "sdk-not-ready", message: session.message };
      }

      try {
        return await session.startPrivateTransfer(input);
      } catch (error) {
        return { kind: "failed", message: error instanceof Error ? error.message : "Invisible transfer failed." };
      } finally {
        session.close();
      }
    },
  };
}

export function buildCoordinatorPool(config: AppConfig): CoordinatorPoolConfig {
  const endpoint = new URL(config.invisibleCoordinatorWsUrl);
  if (endpoint.protocol !== "wss:" && endpoint.protocol !== "ws:") {
    throw new Error("INVISIBLE_COORDINATOR_WS_URL must use ws:// or wss://");
  }
  if (config.invisibleRequiredMode === "prod" && config.invisibleAllowMissingDcapCollateral) {
    throw new Error("INVISIBLE_ALLOW_MISSING_DCAP_COLLATERAL is only allowed outside prod mode");
  }

  return {
    endpoints: [
      {
        wsUrl: config.invisibleCoordinatorWsUrl,
        expectedHostname: endpoint.hostname,
        requiredMode: config.invisibleRequiredMode,
        releasePin: {
          mrtd: config.invisibleReleaseMrtd,
          intelRootFingerprint: config.invisibleIntelRootFingerprint,
          ...(config.invisibleAllowMissingDcapCollateral
            ? { allowMissingDcapCollateral: true }
            : {}),
        },
      },
    ],
    allowedRoles: ["leader"],
    preferLeader: true,
  };
}

export function singleDestinationPolicy(destinationAddress: string): PayoutPolicy {
  return {
    destinations: [{ address: destinationAddress.trim(), sharePercent: 100 }],
  };
}

async function loadSdk(): Promise<{ root: SdkRoot; user: SdkUser; storage: SdkStorage } | null> {
  try {
    const scope = "@invisible";
    const [root, user, storage] = await Promise.all([
      import(`${scope}/sdk`) as Promise<SdkRoot>,
      import(`${scope}/sdk/user`) as Promise<SdkUser>,
      import(`${scope}/sdk/storage`) as Promise<SdkStorage>,
    ]);
    return { root, user, storage };
  } catch {
    return null;
  }
}

function normalizeSdkError(sdk: SdkRoot, error: unknown): string {
  if (sdk.normalizeError) return sdk.normalizeError(error, "Invisible transfer failed.");
  if (error instanceof Error) return error.message;
  return "Invisible transfer failed.";
}
