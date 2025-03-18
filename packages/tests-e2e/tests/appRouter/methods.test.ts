import { expect, test } from "@playwright/test";

test.describe("all supported methods should work in route handlers", () => {
  test("GET", async ({ request }) => {
    const getRes = await request.get("/methods");
    const getData = await getRes.json();
    expect(getRes.status()).toEqual(200);
    expect(getData.message).toEqual("OpenNext is awesome! :) :] :> :D");
  });

  test("POST", async ({ request }) => {
    const postRes = await request.post("/methods", {
      headers: {
        "Content-Type": "text/plain",
      },
      data: "OpenNext is awesome! :] :) :> :D",
    });
    expect(postRes.status()).toBe(202);
    const postData = await postRes.json();
    expect(postData.message).toBe("ok");
    const errorPostRes = await request.post("/methods", {
      headers: {
        "Content-Type": "text/plain",
      },
      data: "OpenNext is not awesome! :C",
    });
    expect(errorPostRes.status()).toBe(403);
    const errorData = await errorPostRes.json();
    expect(errorData.message).toBe("forbidden");
  });

  test("PUT", async ({ request }) => {
    const putRes = await request.put("/methods", {
      data: {
        message: "OpenNext PUT",
      },
    });
    expect(putRes.status()).toEqual(201);
    const putData = await putRes.json();
    expect(putData.message).toEqual("ok");
  });

  test("PATCH", async ({ request }) => {
    const timestampBefore = new Date();
    const patchRes = await request.patch("/methods", {
      data: { message: "OpenNext PATCH" },
    });
    expect(patchRes.status()).toEqual(202);
    const patchData = await patchRes.json();
    expect(patchData.message).toEqual("ok");
    expect(patchData.modified).toEqual(true);
    expect(Date.parse(patchData.timestamp)).toBeGreaterThan(
      timestampBefore.getTime(),
    );
  });

  test("DELETE", async ({ request }) => {
    const deleteRes = await request.delete("/methods", {
      params: {
        command: "rm -rf / --no-preserve-root",
      },
    });
    expect(deleteRes.status()).toEqual(204);
  });

  test("HEAD", async ({ request }) => {
    const headRes = await request.head("/methods");
    expect(headRes.status()).toEqual(200);
    const headers = headRes.headers();
    expect(headers["content-type"]).toEqual("text/html; charset=utf-8");
    // expect(headers["content-length"]).toEqual("1234567");
    expect(headers["special-header"]).toEqual(
      "OpenNext is the best :) :] :> :D",
    );
  });

  test("OPTIONS", async ({ request }) => {
    const optionsRes = await request.fetch("/methods", {
      method: "OPTIONS",
    });
    expect(optionsRes.status()).toEqual(204);
    const headers = optionsRes.headers();
    expect(headers["allow"]).toContain("GET");
    expect(headers["allow"]).toContain("HEAD");
    expect(headers["allow"]).toContain("POST");
    expect(headers["allow"]).toContain("PUT");
    expect(headers["allow"]).toContain("PATCH");
    expect(headers["allow"]).toContain("DELETE");
    expect(headers["allow"]).toContain("OPTIONS");
    expect(headers["allow"]).toContain("LOVE");
    expect(headers["special"]).toContain("OpenNext is the best :) :] :> :D");
  });
});

test("formData should work in POST route handler", async ({ request }) => {
  const formData = new FormData();
  formData.append("name", "OpenNext [] () %&#!%$#");
  formData.append("email", "opennext@opennext.com");
  const postRes = await request.post("/methods/post/formdata", {
    form: formData,
  });
  expect(postRes.status()).toBe(202);
  const postData = await postRes.json();
  expect(postData.message).toBe("ok");
});

test("revalidate should work in GET route handler", async ({
  request,
  page,
}) => {
  let time = Date.parse(
    (await request.get("/methods/get/revalidate").then((res) => res.json()))
      .time,
  );
  let newTime: number;
  let tempTime = time;
  do {
    await page.waitForTimeout(1000);
    time = tempTime;
    const newTimeRes = await request.get("/methods/get/revalidate");
    newTime = Date.parse((await newTimeRes.json()).time);
    tempTime = newTime;
  } while (time !== newTime);
  const midTime = Date.parse(
    (await request.get("/methods/get/revalidate").then((res) => res.json()))
      .time,
  );

  await page.waitForTimeout(1000);
  // Expect that the time is still stale
  expect(midTime).toEqual(newTime);

  // Wait 5 + 1 seconds for ISR to regenerate time
  await page.waitForTimeout(6000);
  let finalTime = newTime;
  do {
    await page.waitForTimeout(2000);
    finalTime = Date.parse(
      (await request.get("/methods/get/revalidate").then((res) => res.json()))
        .time,
    );
  } while (newTime === finalTime);

  expect(newTime).not.toEqual(finalTime);
});

test("should cache a static GET route", async ({ request }) => {
  const res = await request.get("/methods/get/static");
  expect(res.headers()["cache-control"]).toBe("s-maxage=31536000,");
});

test("should be able to set cookies in route handler", async ({ request }) => {
  const postRes = await request.post("/methods/post/cookies", {
    form: {
      username: "hakuna",
      password: "matata",
    },
  });
  expect(postRes.status()).toBe(202);
  const postData = await postRes.json();
  expect(postData.message).toBe("ok");
  const cookies = postRes.headers()["set-cookie"];
  expect(cookies).toContain("auth_session=SUPER_SECRET_SESSION_ID_1234");
});

test("should be able to redirect in route handler", async ({ request }) => {
  const redirectRes = await request.get("/methods/get/redirect", {
    // Disable auto-redirect to check initial response
    maxRedirects: 0,
  });
  expect(redirectRes.status()).toBe(307);
  expect(redirectRes.headers()["location"]).toBe("https://nextjs.org/");

  // Check if the redirect works
  const followedRes = await request.get("/methods/get/redirect");
  expect(followedRes.url()).toBe("https://nextjs.org/");
});

test("dynamic segments should work in route handlers", async ({ request }) => {
  const res = await request.get("/methods/get/dynamic-segments/this-is-a-slug");
  const data = await res.json();
  expect(data.slug).toBe("this-is-a-slug");
});

test("query parameters should work in route handlers", async ({ request }) => {
  const res = await request.get("/methods/get/query", {
    params: {
      query: "OpenNext is awesome!",
    },
  });
  const data = await res.json();
  expect(data.query).toBe("OpenNext is awesome!");
});
