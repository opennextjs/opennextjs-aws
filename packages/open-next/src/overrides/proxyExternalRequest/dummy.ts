import type { ProxyExternalRequest } from "types/overrides";
import { FatalError } from "utils/error";

const DummyProxyExternalRequest: ProxyExternalRequest = {
  name: "dummy",
  proxy: async (_event) => {
    throw new FatalError("This is a dummy implementation");
  },
};

export default DummyProxyExternalRequest;
