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
