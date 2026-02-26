export function hasBagsApiKey(): boolean {
  return Boolean(String(process.env.BAGS_API_KEY ?? "").trim());
}

export async function launchTokenViaBags(_params: unknown): Promise<never> {
  throw new Error("Bags.fm launch is not implemented");
}
