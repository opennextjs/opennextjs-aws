"use client";

import { useSearchParams } from "next/navigation";

const queryKeys = [
  "brand",
  "hash",
  "plus",
  "percent",
  "equals",
  "redirect",
] as const;

/**
 * Renders decoded query values from the client router.
 *
 * @return An interactive snapshot of the client-side search parameters
 */
export function ClientSearchParams() {
  const searchParams = useSearchParams();
  const values = Object.fromEntries(
    queryKeys.map((key) => [key, searchParams.getAll(key)]),
  );

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
