import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";

import type { AppConfig } from "./config.js";
import { shortAddress } from "./format.js";
import type {
  InvisibleClient,
  PrivateTransferInput,
  PrivateTransferResult,
  PrivateTransferSession,
} from "./sdk.js";

const PRIVATE_TRANSFER_IDLE_MS = 60 * 60 * 1000;
const CONTACT_URL = "https://t.me/+yB_xp8V1BZw3N2Jk";

type MenuSession = {
  readonly session: Extract<PrivateTransferSession, { kind: "ready" }>;
  timeout: ReturnType<typeof setTimeout>;
};

export function createBot(config: AppConfig, invisible: InvisibleClient): Bot {
  const bot = new Bot(config.telegramBotToken);
  const privateSessions = new Map<number, MenuSession>();

  bot.command("start", async (ctx) => {
    closePrivateSession(ctx, privateSessions);
    await ctx.reply("Trading menu", {
      reply_markup: mainMenu(),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/start\n/private buy SOL 0.1 <destination>\n/status");
  });

  bot.command("status", async (ctx) => {
    const session = currentPrivateSession(ctx, privateSessions);
    await ctx.reply(session ? "Private transfer mode is open." : "Ready.");
  });

  bot.command("private", async (ctx) => {
    const parsed = parsePrivateCommand(ctx.match);
    if (!parsed.ok) {
      await ctx.reply(parsed.message);
      return;
    }
    await runOneShotPrivateTransfer(ctx, invisible, parsed.input);
  });

  bot.callbackQuery("menu:private-transfer", async (ctx) => {
    await ctx.answerCallbackQuery();
    await openPrivateTransferMenu(ctx, invisible, privateSessions);
  });

  bot.callbackQuery("private:buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    await runPrivateTransferFromMenu(ctx, privateSessions, {
      side: "buy",
      mint: "SOL",
      amountSol: config.demoAmountSol,
      destinationAddress: config.demoDestinationAddress,
    });
  });

  bot.callbackQuery("menu:trading", async (ctx) => {
    await ctx.answerCallbackQuery();
    closePrivateSession(ctx, privateSessions);
    await ctx.reply("Trading menu", {
      reply_markup: mainMenu(),
    });
  });

  bot.callbackQuery("private:close", async (ctx) => {
    await ctx.answerCallbackQuery();
    closePrivateSession(ctx, privateSessions);
    await ctx.reply("Private transfer mode closed.", {
      reply_markup: mainMenu(),
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
    .text("Private transfer", "menu:private-transfer")
    .row()
    .text("Trading menu", "menu:trading")
    .row()
    .url("Contact us", CONTACT_URL);
}

function privateTransferMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Buy SOL privately", "private:buy")
    .row()
    .text("Back to trading", "menu:trading")
    .text("Close", "private:close")
    .row()
    .url("Contact us", CONTACT_URL);
}

async function runOneShotPrivateTransfer(
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

async function openPrivateTransferMenu(
  ctx: Context,
  invisible: InvisibleClient,
  sessions: Map<number, MenuSession>,
): Promise<void> {
  closePrivateSession(ctx, sessions);

  const opened = await invisible.openPrivateTransferSession();
  if (opened.kind === "unavailable") {
    await ctx.reply(opened.message, { reply_markup: mainMenu() });
    return;
  }

  const key = sessionKey(ctx);
  if (key === null) {
    opened.close();
    await ctx.reply("Open this menu from a Telegram chat.", { reply_markup: mainMenu() });
    return;
  }

  sessions.set(key, {
    session: opened,
    timeout: setTimeout(() => {
      const active = sessions.get(key);
      if (!active) return;
      active.session.close();
      sessions.delete(key);
    }, PRIVATE_TRANSFER_IDLE_MS),
  });

  await ctx.reply(
    "Private transfer mode is open for one hour. Choose an action below. Leaving this menu closes the private transfer session.",
    { reply_markup: privateTransferMenu() },
  );
}

async function runPrivateTransferFromMenu(
  ctx: Context,
  sessions: Map<number, MenuSession>,
  input: PrivateTransferInput,
): Promise<void> {
  const active = currentPrivateSession(ctx, sessions);
  if (!active) {
    await ctx.reply("Open private transfer mode first.", { reply_markup: mainMenu() });
    return;
  }

  refreshPrivateSession(ctx, sessions);
  await ctx.reply(
    `Routing ${input.side} ${input.amountSol} ${input.mint} privately to ${shortAddress(
      input.destinationAddress,
    )}.`,
  );

  try {
    const result = await active.session.startPrivateTransfer(input);
    await ctx.reply(renderTransferResult(result), { reply_markup: privateTransferMenu() });
  } catch (error) {
    await ctx.reply(error instanceof Error ? error.message : "Invisible transfer failed.", {
      reply_markup: privateTransferMenu(),
    });
  }
}

function currentPrivateSession(
  ctx: Context,
  sessions: Map<number, MenuSession>,
): MenuSession | undefined {
  const key = sessionKey(ctx);
  return key === null ? undefined : sessions.get(key);
}

function refreshPrivateSession(ctx: Context, sessions: Map<number, MenuSession>): void {
  const key = sessionKey(ctx);
  if (key === null) return;

  const active = sessions.get(key);
  if (!active) return;

  clearTimeout(active.timeout);
  active.timeout = setTimeout(() => {
    const current = sessions.get(key);
    if (!current) return;
    current.session.close();
    sessions.delete(key);
  }, PRIVATE_TRANSFER_IDLE_MS);
}

function closePrivateSession(ctx: Context, sessions: Map<number, MenuSession>): void {
  const key = sessionKey(ctx);
  if (key === null) return;

  const active = sessions.get(key);
  if (!active) return;

  clearTimeout(active.timeout);
  active.session.close();
  sessions.delete(key);
}

function sessionKey(ctx: Context): number | null {
  return ctx.from?.id ?? ctx.chat?.id ?? null;
}
