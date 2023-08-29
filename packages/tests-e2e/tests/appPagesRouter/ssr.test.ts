// NOTE: loading.tsx is currently broken on open-next
//  This works locally but not on deployed apps

// import { test, expect } from "@playwright/test";
// import { wait } from "@open-next/utils";

// NOTE: We don't await page load b/c we want to see the Loading page
// test("Server Side Render and loading.tsx", async ({ page }) => {
//   await page.goto("/");
//   await page.getByRole("link", { name: "SSR" }).click();
//   await page.waitForUrl('/ssr')

//   let loading = page.getByText("Loading...");
//   await expect(loading).toBeVisible();

//   let el = page.getByText("SSR");
//   await expect(el).toBeVisible();
//   const time = await el.textContent();

//   page.reload();
//   loading = page.getByText("Loading...");
//   await expect(loading).toBeVisible();

//   el = page.getByText("SSR");
//   let newTime = await el.textContent();
//   await expect(el).toBeVisible();
//   await expect(time).not.toEqual(newTime);

//   await wait(5000);
//   page.reload();
//   loading = page.getByText("Loading...");
//   await expect(loading).toBeVisible();

//   el = page.getByText("SSR");
//   newTime = await el.textContent();
//   await expect(el).toBeVisible();
//   await expect(time).not.toEqual(newTime);
// });
