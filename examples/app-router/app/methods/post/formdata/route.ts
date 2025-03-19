export async function POST(request: Request) {
  const formData = await request.formData();
  const name = formData.get("name");
  const email = formData.get("email");
  if (name === "OpenNext [] () %&#!%$#" && email === "opennext@opennext.com") {
    return Response.json(
      {
        message: "ok",
      },
      {
        status: 202,
      },
    );
  }
  return Response.json({ message: "forbidden" }, { status: 403 });
}
