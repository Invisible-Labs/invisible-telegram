import {
  callTelegramApi,
  readTelegramBotToken,
  readTelegramWebhookSecret,
  readTelegramWebhookUrl,
} from "./telegram-api.js";

const botToken = readTelegramBotToken();
const webhookUrl = readTelegramWebhookUrl();
const secretToken = readTelegramWebhookSecret();

await callTelegramApi(botToken, "setWebhook", {
  url: webhookUrl,
  secret_token: secretToken,
  allowed_updates: ["message", "callback_query"],
});

console.log(`Telegram webhook set to ${webhookUrl}`);
