import { expect, test } from "@playwright/test";

test("streaming should work in api route", async ({ page }) => {
  const ITERATOR_LENGTH = 10;

  const res = await page.goto("/api/streaming", {
    // we set waitUntil: "commit" to ensure that the response is streamed
    // without this option, the response would be buffered and sent all at once
    // we could also drop the `await` aswell, but then we can't see the headers first.
    waitUntil: "commit",
  });

  expect(res?.headers()["content-type"]).toBe("text/html; charset=utf-8");
  expect(res?.headers()["cache-control"]).toBe("no-cache, no-transform");
  // AWS API Gateway remaps the connection header to `x-amzn-remapped-connection`
  expect(res?.headers()["x-amzn-remapped-connection"]).toBe("keep-alive");

  // wait for first number to be present
  await page.getByTestId("iteratorCount").first().waitFor();

  const seenNumbers: Array<{ number: string; time: number }> = [];
  const startTime = Date.now();

  const initialParagraphs = await page.getByTestId("iteratorCount").count();
  // fail if all paragraphs appear at once
  // this is a safeguard to ensure that the response is streamed and not buffered all at once
  expect(initialParagraphs).toBe(1);

  while (
    seenNumbers.length < ITERATOR_LENGTH &&
    Date.now() - startTime < 11000
  ) {
    const elements = await page.getByTestId("iteratorCount").all();
    if (elements.length > seenNumbers.length) {
      expect(elements.length).toBe(seenNumbers.length + 1);
      const newElement = elements[elements.length - 1];
      const timestamp = await newElement.getAttribute("data-timestamp");
      seenNumbers.push({
        number: await newElement.innerText(),
        time: Number.parseInt(timestamp || "0", 10),
      });
    }
    await page.waitForTimeout(100);
  }

  expect(seenNumbers.map((n) => n.number)).toEqual(
    [...Array(ITERATOR_LENGTH)].map((_, i) => String(i + 1)),
  );

  // verify streaming timing using server timestamps
  for (let i = 1; i < seenNumbers.length; i++) {
    const timeDiff = seenNumbers[i].time - seenNumbers[i - 1].time;
    expect(timeDiff).toBeGreaterThanOrEqual(800);
  }
});
