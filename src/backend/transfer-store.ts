export type TransferRecord = {
  readonly transferId: string;
  readonly telegramUserId: string;
  readonly swapId: string;
  readonly depositAddress: string;
  readonly amountLamports: number;
  readonly depositExpiresAtMs: number;
  readonly syncSecret: Uint8Array;
  readonly recoveryCodeHex?: string;
};

export class TransferStore {
  private readonly transfers = new Map<string, TransferRecord>();

  save(record: TransferRecord): void {
    this.transfers.set(record.transferId, record);
  }

  getOwned(
    telegramUserId: string,
    transferId: string,
  ): TransferRecord | undefined {
    const record = this.transfers.get(transferId);
    if (!record || record.telegramUserId !== telegramUserId) return undefined;
    return record;
  }
}
