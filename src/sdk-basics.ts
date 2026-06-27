import {
  attestation,
  closeSession,
  coordinator,
  createSession,
  normalizeError,
  NotImplementedError,
  type CoordinatorPoolConfig,
  type Session,
} from "@invisible-labs/sdk";
import {
  createCoordinatorSession,
  generateRecoveryCode,
  recoveryCodeFromUserInput,
  recoveryCodeToHex,
  type PayoutSpec,
  type RefundIntentResult,
  type SwapResult,
} from "@invisible-labs/sdk/user";
import {
  completeDkgBatch,
  confirmPositionCodeSaved,
  createLpLifecycleClient,
  createPosition,
  listPositions,
  prepareInitialFunding,
  recoverPosition,
  reconcileFunding,
  refill,
  refreshPosition,
  waitForWithdrawalConfirmation,
  withdrawFees,
  withdrawPosition,
  type CreatePositionResult,
  type InitialFundingPlan,
  type LpPositionView,
  type WithdrawPositionResult,
} from "@invisible-labs/sdk/lp";
import {
  derivedRefundableLamports,
  position as lpPositionStats,
  transfer as transferStats,
} from "@invisible-labs/sdk/stats";
import {
  onReconnect,
  subscribe as subscribeEvents,
  unsubscribe as unsubscribeEvents,
} from "@invisible-labs/sdk/events";
import { inMemoryStorage } from "@invisible-labs/sdk/storage";

const STORAGE_NAMESPACE = "telegram";
const STORAGE_KEY = "sdk-check";
const SAMPLE_REFUNDABLE_LAMPORTS = 2_000_000;
const SAMPLE_NETWORK_FEE_LOSS_LAMPORTS = 5_000;

export type AttestedSessionHandle = {
  readonly session: Session;
  readonly close: () => void;
};

export type PrivateTransferRequest = {
  readonly amountLamports: number;
  readonly payoutSpec: PayoutSpec;
};

export async function runLocalSdkUtilityCheck(): Promise<{
  readonly storageKind: string;
  readonly recoveryCodeHexLength: number;
  readonly refundableLamports: number;
}> {
  const storage = inMemoryStorage();
  const value = new Uint8Array([1, 2, 3]);
  await storage.put(STORAGE_NAMESPACE, STORAGE_KEY, value);
  const keys = await storage.list(STORAGE_NAMESPACE);
  if (!keys.includes(STORAGE_KEY)) throw new Error("storage list missed the saved key");
  const saved = await storage.get(STORAGE_NAMESPACE, STORAGE_KEY);
  if (saved?.length !== value.length) throw new Error("storage get returned an unexpected value");
  await storage.remove(STORAGE_NAMESPACE, STORAGE_KEY);

  const recovery = await generateRecoveryCode();
  return {
    storageKind: storage.kind,
    recoveryCodeHexLength: recoveryCodeToHex(recovery.code).length,
    refundableLamports: derivedRefundableLamports({
      receivedLamports: SAMPLE_REFUNDABLE_LAMPORTS,
      networkFeeLossLamports: SAMPLE_NETWORK_FEE_LOSS_LAMPORTS,
      refundable: true,
    }),
  };
}

export async function openAttestedSession(
  coordinatorPool: CoordinatorPoolConfig,
): Promise<AttestedSessionHandle> {
  const session = await createSession({
    coordinator: coordinatorPool,
    storage: inMemoryStorage(),
  });
  const stopPolicyWatch = attestation.onPolicyViolation(session, (error) => {
    throw error;
  });
  await attestation.assertValid(session);
  coordinator.endpoints(session);
  attestation.current(session);
  attestation.policy(session);

  return {
    session,
    close() {
      stopPolicyWatch();
      closeSession(session);
    },
  };
}

export async function runPrivateTransfer(
  coordinatorPool: CoordinatorPoolConfig,
  request: PrivateTransferRequest,
): Promise<SwapResult> {
  const user = createCoordinatorSession({ coordinator: coordinatorPool });
  try {
    user.onNormalUserActorSync(() => undefined);
    user.onPayoutExecuted(() => undefined);
    return await user.runSwap(request);
  } finally {
    user.close();
  }
}

export async function requestPrivateRefund(
  coordinatorPool: CoordinatorPoolConfig,
  params: {
    readonly swapId: string;
    readonly recoveryCode: string;
    readonly syncSecretHex?: string;
  },
): Promise<RefundIntentResult> {
  const user = createCoordinatorSession({ coordinator: coordinatorPool });
  try {
    user.restoreSwapContext({ swapId: params.swapId });
    return await user.requestRefundIntent({
      swapId: params.swapId,
      recoveryCode: recoveryCodeFromUserInput(params.recoveryCode),
      syncSecret:
        params.syncSecretHex === undefined ? undefined : recoveryCodeFromUserInput(params.syncSecretHex),
    });
  } finally {
    user.close();
  }
}

export async function createLpPositionFlow(
  session: Session,
): Promise<{
  readonly created: CreatePositionResult;
  readonly funding: InitialFundingPlan | null;
}> {
  const client = createLpLifecycleClient(session);
  const created = await client.createPosition();
  client.confirmPositionCodeSaved(created.positionId);
  await client.completeDkgBatch(created.positionId);
  const funding = await client.prepareInitialFunding(created.positionId);
  await client.listPositions();
  return { created, funding };
}

export async function recoverLpPositionFlow(
  session: Session,
  code: string,
): Promise<LpPositionView> {
  return await recoverPosition(session, { code });
}

export async function refillLpPositionFlow(
  session: Session,
  positionId: string,
): Promise<LpPositionView> {
  await refreshPosition(session, positionId);
  return await refill(session, positionId);
}

export async function withdrawLpPositionFlow(
  session: Session,
  positionId: string,
  destinationAddresses: string[],
): Promise<WithdrawPositionResult> {
  const result = await withdrawPosition(session, positionId, { destinationAddresses });
  await waitForWithdrawalConfirmation(session, positionId, result.execution, {
    redemptionRecord: result.redemption,
  });
  return result;
}

export const sdkSurfaceCoverage = {
  session: { createSession, closeSession, attestation, coordinator },
  user: { createCoordinatorSession, generateRecoveryCode, recoveryCodeFromUserInput },
  lp: {
    createLpLifecycleClient,
    createPosition,
    recoverPosition,
    confirmPositionCodeSaved,
    completeDkgBatch,
    prepareInitialFunding,
    reconcileFunding,
    refreshPosition,
    refill,
    withdrawPosition,
    waitForWithdrawalConfirmation,
    withdrawFees,
    listPositions,
  },
  stats: { derivedRefundableLamports, lpPositionStats, transferStats },
  events: { subscribeEvents, unsubscribeEvents, onReconnect },
} as const;

export function sdkErrorCode(error: unknown): string {
  if (error instanceof NotImplementedError) return error.code;
  return normalizeError(error);
}
