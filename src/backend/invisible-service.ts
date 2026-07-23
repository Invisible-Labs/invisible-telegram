import { randomUUID } from "node:crypto";
import { closeSession, createSession, type Session } from "@invisible-labs/sdk";
import {
  contractRequest,
  recoveryCodeFromHex,
  requestRefund,
  sync,
  type ClientSwapState,
  type NormalUserRefundability,
  type NormalUserSettlementPhase,
} from "@invisible-labs/sdk/user";
import { getCoordinatorConfig } from "../config.js";
import { TransferStore, type TransferRecord } from "./transfer-store.js";

const DEMO_AMOUNT_LAMPORTS = 400_000_000;
const DEMO_DESTINATION_ADDRESS = "CWphQhNYhrRo8hzWToYGYjor3CybNMgrQGYMXoon8Y7x";
const INSTANT_PAYOUT_WINDOW_MS = 0;
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export type CreatedTransfer = {
  readonly transferId: string;
  readonly depositAddress: string;
  readonly amountLamports: number;
  readonly depositExpiresAtMs: number;
};

export type TransferStatus = {
  readonly transferId: string;
  readonly state: ClientSwapState;
  readonly settlementPhase: NormalUserSettlementPhase | null;
  readonly refundability: NormalUserRefundability | null;
  readonly depositAddress: string;
  readonly amountLamports: number;
  readonly depositAmountLamports: number;
  readonly depositExpiresAtMs: number;
  readonly settlementTxHashes: readonly string[];
  readonly withdrawalTxHashes: readonly string[];
};

export type RefundAcceptance = {
  readonly accepted: true;
  readonly requestId: string;
};

export interface InvisibleBackendService {
  createTransfer(telegramUserId: string): Promise<CreatedTransfer>;
  getTransferStatus(
    telegramUserId: string,
    transferId: string,
  ): Promise<TransferStatus | undefined>;
  requestTransferRefund(
    telegramUserId: string,
    transferId: string,
  ): Promise<RefundAcceptance | undefined>;
}

export class InvisibleService implements InvisibleBackendService {
  private readonly transferStore = new TransferStore();
  private session: Session | undefined;
  private sessionCreationPromise: Promise<Session> | undefined;
  private sessionClosingTimer: ReturnType<typeof setTimeout> | undefined;
  private contractRequestQueue: Promise<void> = Promise.resolve();

  async ensureSession(): Promise<Session> {
    if (this.session?.attested) {
      this.resetSessionClosingTimer();
      return this.session;
    }

    this.closeCurrentSession();

    const sessionPromise =
      this.sessionCreationPromise ??
      (this.sessionCreationPromise = createSession({
        coordinator: getCoordinatorConfig(),
      }).then((session) => {
        this.session = session;
        return session;
      }));

    try {
      const session = await sessionPromise;
      this.resetSessionClosingTimer();
      return session;
    } finally {
      if (this.sessionCreationPromise === sessionPromise) {
        this.sessionCreationPromise = undefined;
      }
    }
  }

  close(): void {
    this.clearSessionClosingTimer();
    this.closeCurrentSession();
  }

  async createTransfer(telegramUserId: string): Promise<CreatedTransfer> {
    return this.withQueuedContractRequest(async () => {
      const session = await this.ensureSession();
      const result = await contractRequest(session, {
        amountLamports: DEMO_AMOUNT_LAMPORTS,
        payoutPolicy: {
          destinations: [
            {
              address: DEMO_DESTINATION_ADDRESS,
              sharePercent: 100,
            },
          ],
          totalDeadlineMs: INSTANT_PAYOUT_WINDOW_MS,
        },
      });

      const transferId = randomUUID();
      const record: TransferRecord = {
        transferId,
        telegramUserId,
        swapId: result.swapId,
        depositAddress: result.depositAddress,
        amountLamports: result.amountLamports,
        depositExpiresAtMs: result.depositExpiresAtMs,
        syncSecret: new Uint8Array(result.syncSecret),
        ...(result.recoveryCodeHex !== undefined && {
          recoveryCodeHex: result.recoveryCodeHex,
        }),
      };
      this.transferStore.save(record);

      return {
        transferId,
        depositAddress: result.depositAddress,
        amountLamports: result.amountLamports,
        depositExpiresAtMs: result.depositExpiresAtMs,
      };
    });
  }

  async getTransferStatus(
    telegramUserId: string,
    transferId: string,
  ): Promise<TransferStatus | undefined> {
    const record = this.transferStore.getOwned(telegramUserId, transferId);
    if (!record) return undefined;

    const session = await this.ensureSession();
    const result = await sync(session, record.swapId, record.syncSecret);
    const snapshot = result.actor_sync?.snapshot;

    return {
      transferId: record.transferId,
      state: result.state,
      settlementPhase: snapshot?.settlement_phase ?? null,
      refundability: snapshot?.refundability ?? null,
      depositAddress: record.depositAddress,
      amountLamports: record.amountLamports,
      depositAmountLamports: snapshot?.deposit_amount_lamports ?? 0,
      depositExpiresAtMs: record.depositExpiresAtMs,
      settlementTxHashes: snapshot?.settlement_tx_hashes ?? [],
      withdrawalTxHashes: snapshot?.withdrawal_tx_hashes ?? [],
    };
  }

  async requestTransferRefund(
    telegramUserId: string,
    transferId: string,
  ): Promise<RefundAcceptance | undefined> {
    const record = this.transferStore.getOwned(telegramUserId, transferId);
    if (!record) return undefined;
    if (!record.recoveryCodeHex) {
      throw new Error("Recovery code is not available for this transfer");
    }

    const session = await this.ensureSession();
    return requestRefund(session, {
      recoveryCode: recoveryCodeFromHex(record.recoveryCodeHex),
    });
  }

  private resetSessionClosingTimer(): void {
    this.clearSessionClosingTimer();
    this.sessionClosingTimer = setTimeout(() => {
      this.sessionClosingTimer = undefined;
      this.closeCurrentSession();
    }, SESSION_IDLE_TIMEOUT_MS);

    if (
      typeof this.sessionClosingTimer === "object" &&
      this.sessionClosingTimer !== null &&
      "unref" in this.sessionClosingTimer
    ) {
      (this.sessionClosingTimer as { unref(): void }).unref();
    }
  }

  private clearSessionClosingTimer(): void {
    if (!this.sessionClosingTimer) return;
    clearTimeout(this.sessionClosingTimer);
    this.sessionClosingTimer = undefined;
  }

  private closeCurrentSession(): void {
    const session = this.session;
    this.session = undefined;
    if (session) closeSession(session);
  }

  private async withQueuedContractRequest<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.contractRequestQueue;
    let release!: () => void;
    this.contractRequestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
