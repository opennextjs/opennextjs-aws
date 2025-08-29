import { spawn } from "node:child_process";

import express from "express";
import proxy from "express-http-proxy";

const PORT = 3002;

// Start servers
spawn("node", [".open-next/server-functions/default/index.mjs"], {
  env: { ...process.env, PORT: "3003" },
  stdio: "inherit",
});

spawn("node", [".open-next/server-functions/api/index.mjs"], {
  env: { ...process.env, PORT: "3004" },
  stdio: "inherit",
});

const app = express();

app.use(
  "/api/*",
  proxy("http://localhost:3004", {
    proxyReqPathResolver: (req) => req.originalUrl,
    proxyReqOptDecorator: (proxyReqOpts) => {
      proxyReqOpts.headers.host = `localhost:${PORT}`;
      return proxyReqOpts;
    },
  }),
);

// Catch-all for everything else
app.use(
  "*",
  proxy("http://localhost:3003", {
    proxyReqPathResolver: (req) => req.originalUrl,
    proxyReqOptDecorator: (proxyReqOpts) => {
      // We need to ensure the host header is set correctly else you will run into this error in `/server-actions`
      // Error: Invalid Server Actions request:
      // `x-forwarded-host` header with value `localhost:3003` does not match `origin` header with value `localhost:3002` from a forwarded Server Actions request. Aborting the action.
      proxyReqOpts.headers.host = `localhost:${PORT}`;
      delete proxyReqOpts.headers["x-forwarded-host"];
      return proxyReqOpts;
    },
  }),
);

app.listen(PORT, () => {
  console.log(`Proxy running at http://localhost:${PORT}`);
});
