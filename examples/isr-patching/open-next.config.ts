import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

export default {
  default: {},
  buildCommand: `pnpm exec next build --${process.env.NEXT_BUNDLER ?? "turbopack"}`,
} satisfies OpenNextConfig;
