import { expect, test } from "@playwright/test";

const SADE_SMOOTH_OPERATOR_LYRIC = `Diamond life, lover boy
He move in space with minimum waste and maximum joy
City lights and business nights
When you require streetcar desire for higher heights
No place for beginners or sensitive hearts
When sentiment is left to chance
No place to be ending but somewhere to start
No need to ask, he's a smooth operator
Smooth operator, smooth operator
Smooth operator`;

test("streaming should work in api route", async ({ page }) => {
  await page.goto("/sse");

  // wait for first line to be present
  await page.getByTestId("line").first().waitFor();
  const initialLines = await page.getByTestId("line").count();
  // fail if all lines appear at once
  // this is a safeguard to ensure that the response is streamed and not buffered all at once
  expect(initialLines).toBe(1);

  const seenLines: Array<{ line: string; time: number }> = [];
  const startTime = Date.now();

  // we loop until we see all lines
  while (seenLines.length < SADE_SMOOTH_OPERATOR_LYRIC.split("\n").length) {
    const lines = await page.getByTestId("line").all();
    if (lines.length > seenLines.length) {
      expect(lines.length).toBe(seenLines.length + 1);
      const newLine = lines[lines.length - 1];
      seenLines.push({
        line: await newLine.innerText(),
        time: Date.now() - startTime,
      });
    }
    // wait for a bit before checking again
    await page.waitForTimeout(200);
  }

  expect(seenLines.map((n) => n.line)).toEqual(
    SADE_SMOOTH_OPERATOR_LYRIC.split("\n"),
  );
  for (let i = 1; i < seenLines.length; i++) {
    expect(seenLines[i].time - seenLines[i - 1].time).toBeGreaterThan(500);
  }

  await expect(page.getByTestId("video")).toBeVisible();
});
