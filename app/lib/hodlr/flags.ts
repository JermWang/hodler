export type HodlrFlags = {
  enabled: boolean;
  shadowMode: boolean;
};

function parseEnvBool(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function getHodlrFlags(): HodlrFlags {
  const enabled = parseEnvBool(process.env.NEXT_PUBLIC_HODLR_ENABLED ?? process.env.HODLR_ENABLED);
  const shadowMode = parseEnvBool(process.env.NEXT_PUBLIC_HODLR_SHADOW_MODE ?? process.env.HODLR_SHADOW_MODE);
  return { enabled, shadowMode };
}

export function isHodlrEnabled(): boolean {
  return getHodlrFlags().enabled;
}

export function isHodlrShadowMode(): boolean {
  const f = getHodlrFlags();
  return f.enabled && f.shadowMode;
}
