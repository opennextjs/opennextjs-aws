import { cookies } from "next/headers";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = formData.get("username");
  const password = formData.get("password");
  if (username === "hakuna" && password === "matata") {
    (await cookies()).set("auth_session", "SUPER_SECRET_SESSION_ID_1234");
    return Response.json(
      {
        message: "ok",
      },
      {
        status: 202,
      },
    );
  }
  return Response.json({ message: "you must login" }, { status: 401 });
}
