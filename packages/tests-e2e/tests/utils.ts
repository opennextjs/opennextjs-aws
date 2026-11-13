import { createHash } from "node:crypto";
import { type Page, expect } from "@playwright/test";

export function validateMd5(data: Buffer, expectedHash: string) {
  return createHash("md5").update(data).digest("hex") === expectedHash;
}

/**
 * Verifies that the browser satisfies a segment prefetch and can navigate with it.
 *
 * @param page A fresh browser page for an example with an Albums link
 * @returns A promise that resolves after prefetching settles and navigation succeeds
 * @throws When the segment response is invalid, prefetching loops, or navigation fails
 */
export async function expectSegmentPrefetchSettles(page: Page): Promise<void> {
  let treeRequests = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.replace(/\/$/, "") === "/albums" &&
      request.headers()["next-router-segment-prefetch"] === "/_tree"
    ) {
      treeRequests++;
    }
  });
  const treeResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/\/$/, "") === "/albums" &&
      response.request().headers()["next-router-segment-prefetch"] === "/_tree",
  );

  await page.goto("/");
  const response = await treeResponse;
  expect(response.status()).toEqual(200);
  expect(response.headers()["x-opennext-cache"]).toEqual("HIT");
  expect(response.headers()["x-nextjs-postponed"]).toEqual("2");

  await response.finished();
  // Observe the completed prefetch for retries. Global networkidle is unsuitable:
  // other links prefetch dynamic routes whose response streams can stay open.
  // The regression continuously re-requested this tree while the tab was idle.
  await page.waitForTimeout(1000);
  expect(treeRequests).toEqual(1);

  await page.getByRole("link", { name: "Albums" }).click();
  await expect(page).toHaveURL(/\/albums\/?$/);
  await expect(
    page.getByRole("link", {
      name: "Song: I'm never gonna give you up Year: 1965",
    }),
  ).toBeVisible();
}
