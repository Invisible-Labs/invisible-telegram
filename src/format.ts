const LAMPORTS_PER_SOL = 1_000_000_000n;

export function solToLamports(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error("Amount must be a positive SOL value with up to 9 decimals.");
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fraction.padEnd(9, "0"));
  if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is outside this example's safe integer range.");
  }
  return Number(lamports);
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
