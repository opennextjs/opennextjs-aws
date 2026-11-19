import type { Wrapper } from "types/overrides";

import { createNodeServerWrapper } from "../../utils/node-server-wrapper";

export default createNodeServerWrapper({
  name: "node",
  resolveAddress: () => ({
    port: Number.parseInt(process.env.PORT ?? "3000", 10),
  }),
  waitUntil: false,
}) satisfies Wrapper;
