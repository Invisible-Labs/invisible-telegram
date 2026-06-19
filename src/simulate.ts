import { parsePrivateCommand, renderTransferResult } from "./bot.js";

const parsed = parsePrivateCommand("buy SOL 0.1 11111111111111111111111111111111");
if (!parsed.ok) throw new Error(parsed.message);

const output = renderTransferResult({ kind: "accepted", requestId: "demo-request" });
if (!output.includes("demo-request")) {
  throw new Error("simulation did not render the accepted request");
}

console.log("telegram simulation ok");
