import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && typeof item !== "function" && typeof item !== "symbol")
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return null;
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function hashAnalysisSource(value: unknown): string {
  if (!value || typeof value !== "object") return hashCanonicalJson(value);
  const source = { ...(value as Record<string, unknown>) };
  delete source.figure;
  return hashCanonicalJson(source);
}
