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
type SdkLpPosition = {
  id: string;
  status: string;
  targetShardCount: number;
  shards: Array<{ status: string }>;
  committedLamports: number;
  earnedLamports: number;
};
type SdkLp = {
  createPosition(
    session: SdkSession,
    args?: { committedLamports?: number; shardCount?: number },
  ): Promise<{ positionId: string; lpPositionCode: string; position?: SdkLpPosition }>;
  recoverPosition(session: SdkSession, args: { code: string }): Promise<SdkLpPosition>;
  completeDkgBatch(session: SdkSession, positionId: string): Promise<SdkLpPosition>;
  prepareInitialFunding(
    session: SdkSession,
    positionId: string,
  ): Promise<{
    address: string;
    requiredLamports: number;
    qrPayload: string;
    position?: SdkLpPosition;
  } | null>;
  reconcileFunding(session: SdkSession, positionId: string): Promise<SdkLpPosition>;
  refill(session: SdkSession, positionId: string): Promise<SdkLpPosition>;
  withdrawPosition(
    session: SdkSession,
    positionId: string,
    args: { destinationAddresses: string[]; allowManyToOne: boolean },
  ): Promise<{
    execution: { withdrawalId: string; txSignatures: string[] };
    position: SdkLpPosition;
  }>;
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

export type LpAction =
  | "create"
  | "recover"
  | "complete-dkg"
  | "prepare-funding"
  | "reconcile-funding"
  | "refill"
  | "withdraw";

export type LpActionInput = {
  action: LpAction;
  positionCode?: string;
  destinationAddress?: string;
};

export type LpPositionSummary = {
  id: string;
  status: string;
  targetShardCount: number;
  shardCount: number;
  availableShardCount: number;
  fundingQueuedShardCount: number;
  pregeneratedShardCount: number;
  committedLamports: number;
  earnedLamports: number;
};

export type LpActionResult =
  | {
      kind: "position";
      action: LpAction;
      message: string;
      position: LpPositionSummary;
      lpPositionCode?: string;
    }
  | {
      kind: "funding";
      action: "prepare-funding";
      message: string;
      position: LpPositionSummary;
      address: string;
      requiredLamports: number;
      qrPayload: string;
    }
  | {
      kind: "withdrawal";
      action: "withdraw";
      message: string;
      position: LpPositionSummary;
      withdrawalId: string;
      txSignatures: string[];
    }
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
  runLpAction(input: LpActionInput): Promise<LpActionResult>;
};

const LP_DEFAULT_TARGET_SHARDS = 200;
const LP_INITIAL_FUNDING_LAMPORTS = 101_000_000;
const LP_WITHDRAWAL_ALLOW_MANY_TO_ONE = true;

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
    async runLpAction(input) {
      const sdk = await loadSdk();
      if (!sdk) {
        return {
          kind: "sdk-missing",
          message: "Install @invisible/sdk from the private package registry before running LP actions.",
        };
      }

      try {
        const session = await sdk.root.createSession({
          coordinator: buildCoordinatorPool(config),
          storage: sdk.storage.inMemoryStorage?.(),
        });

        try {
          if (input.action === "create") {
            const result = await sdk.lp.createPosition(session, {
              committedLamports: LP_INITIAL_FUNDING_LAMPORTS,
              shardCount: LP_DEFAULT_TARGET_SHARDS,
            });
            const position =
              result.position ?? (await sdk.lp.recoverPosition(session, { code: result.lpPositionCode }));
            return {
              kind: "position",
              action: input.action,
              message: "LP position created. Store the LP Position Code before continuing.",
              position: summarizeLpPosition(position),
              lpPositionCode: result.lpPositionCode,
            };
          }

          const recovered = await recoverLpPositionForAction(sdk, session, input.positionCode);
          if (input.action === "recover") {
            return {
              kind: "position",
              action: input.action,
              message: "LP position recovered.",
              position: summarizeLpPosition(recovered),
            };
          }

          if (input.action === "complete-dkg") {
            const position = await sdk.lp.completeDkgBatch(session, recovered.id);
            return {
              kind: "position",
              action: input.action,
              message: "LP DKG batch completed or reconciled.",
              position: summarizeLpPosition(position),
            };
          }

          if (input.action === "prepare-funding") {
            const plan = await sdk.lp.prepareInitialFunding(session, recovered.id);
            if (plan === null) {
              return {
                kind: "position",
                action: input.action,
                message: "No LP_DKG_0 funding action is currently available.",
                position: summarizeLpPosition(recovered),
              };
            }
            return {
              kind: "funding",
              action: input.action,
              message: "Fund only LP_DKG_0 with the exact required amount.",
              position: summarizeLpPosition(plan.position ?? recovered),
              address: plan.address,
              requiredLamports: plan.requiredLamports,
              qrPayload: plan.qrPayload,
            };
          }

          if (input.action === "reconcile-funding") {
            const position = await sdk.lp.reconcileFunding(session, recovered.id);
            return {
              kind: "position",
              action: input.action,
              message: "LP funding reconciled from coordinator state.",
              position: summarizeLpPosition(position),
            };
          }

          if (input.action === "refill") {
            const position = await sdk.lp.refill(session, recovered.id);
            return {
              kind: "position",
              action: input.action,
              message: "LP refill requested through the SDK lifecycle.",
              position: summarizeLpPosition(position),
            };
          }

          const destination = input.destinationAddress?.trim();
          if (!destination) throw new Error("destination is required for withdraw.");
          const result = await sdk.lp.withdrawPosition(session, recovered.id, {
            destinationAddresses: [destination],
            allowManyToOne: LP_WITHDRAWAL_ALLOW_MANY_TO_ONE,
          });
          return {
            kind: "withdrawal",
            action: input.action,
            message: "LP withdrawal requested. Reconciliation stays SDK-owned.",
            position: summarizeLpPosition(result.position),
            withdrawalId: result.execution.withdrawalId,
            txSignatures: result.execution.txSignatures,
          };
        } finally {
          sdk.root.closeSession?.(session);
        }
      } catch (error) {
        const message = normalizeSdkError(sdk.root, error);
        if (message.includes("NOT_ATTESTED") || message.includes("not attested")) {
          return {
            kind: "sdk-not-ready",
            message: "SDK connected, but this package build has not completed coordinator attestation yet.",
          };
        }
        return { kind: "failed", message };
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

async function loadSdk(): Promise<{ root: SdkRoot; user: SdkUser; storage: SdkStorage; lp: SdkLp } | null> {
  try {
    const scope = "@invisible";
    const [root, user, lp, storage] = await Promise.all([
      import(`${scope}/sdk`) as Promise<SdkRoot>,
      import(`${scope}/sdk/user`) as Promise<SdkUser>,
      import(`${scope}/sdk/lp`) as Promise<SdkLp>,
      import(`${scope}/sdk/storage`) as Promise<SdkStorage>,
    ]);
    return { root, user, storage, lp };
  } catch {
    return null;
  }
}

async function recoverLpPositionForAction(
  sdk: { lp: SdkLp },
  session: SdkSession,
  positionCode: string | undefined,
): Promise<SdkLpPosition> {
  const code = positionCode?.trim();
  if (!code) throw new Error("LP Position Code is required for this action.");
  return sdk.lp.recoverPosition(session, { code });
}

function summarizeLpPosition(position: SdkLpPosition): LpPositionSummary {
  return {
    id: position.id,
    status: position.status,
    targetShardCount: position.targetShardCount,
    shardCount: position.shards.length,
    availableShardCount: countLpShards(position, "AVAILABLE"),
    fundingQueuedShardCount: countLpShards(position, "FUNDING_QUEUED"),
    pregeneratedShardCount: countLpShards(position, "PREGENERATED"),
    committedLamports: position.committedLamports,
    earnedLamports: position.earnedLamports,
  };
}

function countLpShards(position: SdkLpPosition, status: string): number {
  return position.shards.filter((shard) => shard.status === status).length;
}

function normalizeSdkError(sdk: SdkRoot, error: unknown): string {
  if (sdk.normalizeError) return sdk.normalizeError(error, "Invisible transfer failed.");
  if (error instanceof Error) return error.message;
  return "Invisible transfer failed.";
}
