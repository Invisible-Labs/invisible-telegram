import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { Telegraf } from "telegraf";

export const TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";

const SERVICE_UNAVAILABLE_TEXT = "Service unavailable";

/**
 * Compose the backend API and Telegram webhook into one HTTP service.
 *
 * The backend remains a nested Express application so the Telegram handlers
 * continue to use the same authenticated HTTP API as the two-service setup.
 * The webhook middleware is mounted without a path prefix because Telegraf
 * validates the original request URL against TELEGRAM_WEBHOOK_PATH.
 */
export function createWebApp(
  backendApp: Express,
  bot: Telegraf,
  webhookSecret: string | undefined,
): Express {
  const app = express();

  app.use(backendApp);
  const webhookHandler =
    webhookSecret === undefined
      ? bot.webhookCallback(TELEGRAM_WEBHOOK_PATH)
      : bot.webhookCallback(TELEGRAM_WEBHOOK_PATH, {
          secretToken: webhookSecret,
        });
  app.use((request, response) => webhookHandler(request, response));
  app.use(handleWebhookError);

  return app;
}

function handleWebhookError(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[telegram] webhook request failed: ${message}`);

  if (response.headersSent) return;
  response.status(503).json({ error: SERVICE_UNAVAILABLE_TEXT });
}
