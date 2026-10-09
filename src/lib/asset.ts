// Prefixes a public-asset path with the deployed basePath ("" in local dev).
// NEXT_PUBLIC_BASE_PATH is inlined at build time via next.config `env`.
export const asset = (p: string) =>
  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${p}`;
