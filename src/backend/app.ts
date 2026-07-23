import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { InvisibleBackendService } from "./invisible-service.js";

const API_VERSION_PREFIX = "/v1";
const TRANSFERS_PATH = `${API_VERSION_PREFIX}/transfers`;
const AUTHORIZATION_HEADER = "authorization";
const TELEGRAM_USER_ID_HEADER = "x-telegram-user-id";
const BEARER_PREFIX = "Bearer ";

export function createBackendApp(
  service: InvisibleBackendService,
  apiToken: string,
) {
  const app = express();

  app.use(express.json());
  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.use(API_VERSION_PREFIX, authenticate(apiToken));

  app.post(TRANSFERS_PATH, async (request, response, next) => {
    try {
      const telegramUserId = requireTelegramUserId(request);
      const transfer = await service.createTransfer(telegramUserId);
      response.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.get(`${TRANSFERS_PATH}/:transferId`, async (request, response, next) => {
    try {
      const telegramUserId = requireTelegramUserId(request);
      const transfer = await service.getTransferStatus(
        telegramUserId,
        request.params.transferId,
      );
      if (!transfer) {
        response.status(404).json({ error: "Transfer not found" });
        return;
      }
      response.json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    `${TRANSFERS_PATH}/:transferId/refund`,
    async (request, response, next) => {
      try {
        const telegramUserId = requireTelegramUserId(request);
        const refund = await service.requestTransferRefund(
          telegramUserId,
          request.params.transferId,
        );
        if (!refund) {
          response.status(404).json({ error: "Transfer not found" });
          return;
        }
        response.status(202).json(refund);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      const message =
        error instanceof Error ? error.message : "Unknown backend error";
      console.error(`[backend] request failed: ${message}`);
      if (error instanceof HttpError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      response.status(503).json({ error: "Invisible backend unavailable" });
    },
  );

  return app;
}

function authenticate(apiToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authorization = request.header(AUTHORIZATION_HEADER);
    if (authorization !== `${BEARER_PREFIX}${apiToken}`) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

function requireTelegramUserId(request: Request): string {
  const userId = request.header(TELEGRAM_USER_ID_HEADER)?.trim();
  if (!userId) throw new HttpError(400, `Missing ${TELEGRAM_USER_ID_HEADER}`);
  return userId;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
