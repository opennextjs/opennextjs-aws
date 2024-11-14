import type { ProxyExternalRequest } from "types/overrides";

const DummyProxyExternalRequest: ProxyExternalRequest = {
  name: "dummy",
  proxy: async (_event) => {
    throw new Error("This is a dummy implementation");
  },
};

export default DummyProxyExternalRequest;
