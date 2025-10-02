//This file is the one used instead of util.ts when using the adapter API from Next.js
import { adapterHandler } from "./routing/adapterHandler";

globalThis.__next_route_preloader = async (stage: string) => {
  // TODO: Implement route preloading logic here
};

export const requestHandler = adapterHandler;

// NOOP for adapter
export function setNextjsPrebundledReact(rawPath: string) {}
