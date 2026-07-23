export type CreatedTransfer = {
  readonly transferId: string;
  readonly depositAddress: string;
  readonly amountLamports: number;
  readonly depositExpiresAtMs: number;
};

export type TransferStatus = {
  readonly transferId: string;
  readonly state: string;
  readonly settlementPhase: string | null;
  readonly refundability: string | null;
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

const AUTHORIZATION_HEADER = "authorization";
const TELEGRAM_USER_ID_HEADER = "x-telegram-user-id";
const BEARER_PREFIX = "Bearer ";

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
  ) {}

  async createTransfer(telegramUserId: string): Promise<CreatedTransfer> {
    const body = await this.request("/v1/transfers", telegramUserId, {
      method: "POST",
    });
    return parseCreatedTransfer(body);
  }

  async getTransferStatus(
    telegramUserId: string,
    transferId: string,
  ): Promise<TransferStatus> {
    const body = await this.request(
      `/v1/transfers/${encodeURIComponent(transferId)}`,
      telegramUserId,
      { method: "GET" },
    );
    return parseTransferStatus(body);
  }

  async requestTransferRefund(
    telegramUserId: string,
    transferId: string,
  ): Promise<RefundAcceptance> {
    const body = await this.request(
      `/v1/transfers/${encodeURIComponent(transferId)}/refund`,
      telegramUserId,
      { method: "POST" },
    );
    return parseRefundAcceptance(body);
  }

  private async request(
    path: string,
    telegramUserId: string,
    init: RequestInit,
  ): Promise<unknown> {
    const response = await fetch(new URL(path, `${this.baseUrl}/`), {
      ...init,
      headers: {
        ...init.headers,
        [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${this.apiToken}`,
        [TELEGRAM_USER_ID_HEADER]: telegramUserId,
      },
    });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(readErrorMessage(body));
    }

    return body;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Backend returned invalid JSON");
  }
}

function parseCreatedTransfer(value: unknown): CreatedTransfer {
  if (
    !isRecord(value) ||
    typeof value.transferId !== "string" ||
    typeof value.depositAddress !== "string" ||
    typeof value.amountLamports !== "number" ||
    typeof value.depositExpiresAtMs !== "number"
  ) {
    throw new Error("Backend returned an invalid transfer");
  }
  return value as CreatedTransfer;
}

function parseTransferStatus(value: unknown): TransferStatus {
  if (
    !isRecord(value) ||
    typeof value.transferId !== "string" ||
    typeof value.state !== "string" ||
    (value.settlementPhase !== null &&
      typeof value.settlementPhase !== "string") ||
    (value.refundability !== null && typeof value.refundability !== "string") ||
    typeof value.depositAddress !== "string" ||
    typeof value.amountLamports !== "number" ||
    typeof value.depositAmountLamports !== "number" ||
    typeof value.depositExpiresAtMs !== "number" ||
    !isStringArray(value.settlementTxHashes) ||
    !isStringArray(value.withdrawalTxHashes)
  ) {
    throw new Error("Backend returned an invalid transfer status");
  }
  return value as TransferStatus;
}

function parseRefundAcceptance(value: unknown): RefundAcceptance {
  if (
    !isRecord(value) ||
    value.accepted !== true ||
    typeof value.requestId !== "string"
  ) {
    throw new Error("Backend returned an invalid refund response");
  }
  return value as RefundAcceptance;
}

function readErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  return "Backend request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
