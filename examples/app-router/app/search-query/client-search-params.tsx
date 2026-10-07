"use client";

import { useSearchParams } from "next/navigation";

const queryKeys = [
  "brand",
  "hash",
  "plus",
  "percent",
  "equals",
  "redirect",
  "path",
] as const;

/**
 * Renders decoded query values from the client router.
 *
 * @return An interactive snapshot of the client-side search parameters
 */
export function ClientSearchParams() {
  const searchParams = useSearchParams();
  const values: Record<string, string[]> = {};
  for (const key of queryKeys) {
    const entries = searchParams.getAll(key);
    if (entries.length > 0) values[key] = entries;
  }

  return (
    <button
      data-testid="client-search-params"
      onClick={(event) => {
        event.currentTarget.dataset.hydrated = "true";
      }}
      type="button"
    >
      {JSON.stringify(values)}
    </button>
  );
}
