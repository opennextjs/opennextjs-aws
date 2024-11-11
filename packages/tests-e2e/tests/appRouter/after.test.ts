import { expect, test } from "@playwright/test";

test("Next after", async ({ request }) => {
  const initialSSG = await request.get("/api/after/ssg");
  expect(initialSSG.status()).toEqual(200);
  const initialSSGJson = await initialSSG.json();

  // We then fire a post request that will revalidate the SSG page 5 seconds after, but should respond immediately
  const dateNow = Date.now();
  const revalidateSSG = await request.post("/api/after/revalidate");
  expect(revalidateSSG.status()).toEqual(200);
  const revalidateSSGJson = await revalidateSSG.json();
  expect(revalidateSSGJson.success).toEqual(true);
  // This request should take less than 5 seconds to respond
  expect(Date.now() - dateNow).toBeLessThan(5000);

  // We want to immediately check if the SSG page has been revalidated, it should not have been
  const notRevalidatedSSG = await request.get("/api/after/ssg");
  expect(notRevalidatedSSG.status()).toEqual(200);
  const notRevalidatedSSGJson = await notRevalidatedSSG.json();
  expect(notRevalidatedSSGJson.date).toEqual(initialSSGJson.date);

  // We then wait for 5 seconds to ensure the SSG page has been revalidated
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const revalidatedSSG = await request.get("/api/after/ssg");
  expect(revalidatedSSG.status()).toEqual(200);
  const revalidatedSSGJson = await revalidatedSSG.json();
  expect(revalidatedSSGJson.date).not.toEqual(initialSSGJson.date);
});
