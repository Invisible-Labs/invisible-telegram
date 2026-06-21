import "dotenv/config";

export function readTelegramBotToken(): string {
  return readRequired("TELEGRAM_BOT_TOKEN");
}

export function readTelegramWebhookUrl(): string {
  const webhookUrl = readRequired("WEBHOOK_URL");
  if (!webhookUrl.startsWith("https://")) {
    throw new Error("WEBHOOK_URL must be an HTTPS URL");
  }

  return webhookUrl;
}

export function readTelegramWebhookSecret(): string {
  return readRequired("TELEGRAM_WEBHOOK_SECRET");
}

export async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string } & T;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }

  return payload;
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
