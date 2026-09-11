export const PRODUCT_KINDS = ["builder", "speakeasy"] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const DEFAULT_PRODUCT_KIND: ProductKind = "builder";

export function normalizeProductKind(value: unknown): ProductKind {
  return value === "speakeasy" ? "speakeasy" : DEFAULT_PRODUCT_KIND;
}

export function productKindFromSearch(search: string): ProductKind {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = query
    .split("&")
    .map((part) => part.split("=", 2))
    .find(([key]) => key === "product")?.[1];
  return normalizeProductKind(raw);
}

export function draftStorageKey(kind: ProductKind): string {
  return kind === "speakeasy"
    ? "dcl-speakeasy-composer-draft"
    : "dcl-frame-kit-composer-draft";
}

export function draftBackupStorageKey(kind: ProductKind): string {
  return `${draftStorageKey(kind)}-backup`;
}
