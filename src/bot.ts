import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";

import type { AppConfig } from "./config.js";
import { shortAddress } from "./format.js";
import type { InvisibleClient, PrivateTransferInput, PrivateTransferResult } from "./sdk.js";

export function createBot(config: AppConfig, invisible: InvisibleClient): Bot {
  const bot = new Bot(config.telegramBotToken);

  bot.command("start", async (ctx) => {
    await ctx.reply("Invisible private transfer demo", {
      reply_markup: mainMenu(),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/private buy SOL 0.1 <destination>\n/status");
  });

  bot.command("status", async (ctx) => {
    await ctx.reply("Ready. Telegram uses HTTPS updates; Invisible uses a server-side WebSocket.");
  });

  bot.command("private", async (ctx) => {
    const parsed = parsePrivateCommand(ctx.match);
    if (!parsed.ok) {
      await ctx.reply(parsed.message);
      return;
    }
    await runPrivateTransfer(ctx, invisible, parsed.input);
  });

  bot.callbackQuery("private:buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    await runPrivateTransfer(ctx, invisible, {
      side: "buy",
      mint: "SOL",
      amountSol: config.demoAmountSol,
      destinationAddress: config.demoDestinationAddress,
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  return bot;
}

export function parsePrivateCommand(raw: string): 
  | { ok: true; input: PrivateTransferInput }
  | { ok: false; message: string } {
  const [side, mint, amountSol, destinationAddress] = raw.trim().split(/\s+/u);
  if ((side !== "buy" && side !== "sell") || !mint || !amountSol || !destinationAddress) {
    return { ok: false, message: "Usage: /private buy SOL 0.1 <destination>" };
  }
  if (side !== "buy" || mint.toUpperCase() !== "SOL") {
    return {
      ok: false,
      message: "This example only supports buy SOL. Add asset routing before accepting other intents.",
    };
  }
  return {
    ok: true,
    input: {
      side,
      mint: "SOL",
      amountSol,
      destinationAddress,
    },
  };
}

export function renderTransferResult(result: PrivateTransferResult): string {
  switch (result.kind) {
    case "accepted":
      return `Invisible request accepted: ${result.requestId}`;
    case "sdk-missing":
    case "sdk-not-ready":
    case "failed":
      return result.message;
  }
}

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Private buy", "private:buy")
    .row()
    .text("Status", "status");
}

async function runPrivateTransfer(
  ctx: Context,
  invisible: InvisibleClient,
  input: PrivateTransferInput,
): Promise<void> {
  await ctx.reply(
    `Routing ${input.side} ${input.amountSol} ${input.mint} privately to ${shortAddress(
      input.destinationAddress,
    )}.`,
  );
  const result = await invisible.startPrivateTransfer(input);
  await ctx.reply(renderTransferResult(result));
}
