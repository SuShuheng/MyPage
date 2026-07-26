const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/;

export function createId(prefix: string): string {
  const safePrefix = normalizeId(prefix);
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${safePrefix}-${Date.now().toString(36)}-${random[0]?.toString(36)}${random[1]?.toString(36)}`;
}

export function normalizeId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}
