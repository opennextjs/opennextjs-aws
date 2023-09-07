import React from "react";

import { headers } from "next/headers";

async function getTime() {
  const res = await new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve(new Date().toISOString());
    }, 1500);
  });
  return res;
}

export default async function SSR() {
  const time = await getTime();
  const headerList = headers();
  return (
    <div>
      <h1>Time: {time}</h1>
      <div> {headerList.get("host")}</div>
    </div>
  );
}
