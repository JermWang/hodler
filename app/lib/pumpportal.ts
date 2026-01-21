export async function pumpportalBuildCollectCreatorFeeTxBase64(input: {
  publicKey: string;
  priorityFee?: number;
}): Promise<{ txBase64: string }> {
  const publicKey = String(input.publicKey ?? "").trim();
  if (!publicKey) throw new Error("publicKey is required");

  const body: any = {
    publicKey,
    action: "collectCreatorFee",
    priorityFee: typeof input.priorityFee === "number" ? input.priorityFee : 0.000001,
  };

  const res = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const details = text.trim() ? `: ${text.slice(0, 240)}` : "";
    throw new Error(`PumpPortal request failed (${res.status})${details}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("PumpPortal returned empty transaction");

  return { txBase64: buf.toString("base64") };
}

export async function pumpportalBuildCreateTokenTxBase64(input: {
  publicKey: string;
  mint: string;
  tokenMetadata: { name: string; symbol: string; uri: string };
  amountSol: string;
  slippage?: number;
  priorityFee?: number;
  pool?: string;
  isMayhemMode?: boolean;
}): Promise<{ txBase64: string }> {
  const publicKey = String(input.publicKey ?? "").trim();
  const mint = String(input.mint ?? "").trim();
  const amountSol = String(input.amountSol ?? "").trim();

  if (!publicKey) throw new Error("publicKey is required");
  if (!mint) throw new Error("mint is required");
  if (!amountSol) throw new Error("amountSol is required");

  const tokenMetadata = input.tokenMetadata ?? ({} as any);
  const name = String(tokenMetadata?.name ?? "").trim();
  const symbol = String(tokenMetadata?.symbol ?? "").trim();
  const uri = String(tokenMetadata?.uri ?? "").trim();
  if (!name || !symbol || !uri) throw new Error("tokenMetadata is required");

  const body: any = {
    publicKey,
    action: "create",
    tokenMetadata: { name, symbol, uri },
    mint,
    denominatedInSol: "true",
    amount: amountSol,
    slippage: typeof input.slippage === "number" ? input.slippage : 5,
    priorityFee: typeof input.priorityFee === "number" ? input.priorityFee : 0.00005,
    pool: String(input.pool ?? "pump"),
    isMayhemMode: input.isMayhemMode ? "true" : "false",
  };

  const res = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const details = text.trim() ? `: ${text.slice(0, 240)}` : "";
    throw new Error(`PumpPortal request failed (${res.status})${details}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error("PumpPortal returned empty transaction");

  return { txBase64: buf.toString("base64") };
}
