import type { WrapperHandler } from "types/overrides";

const dummyWrapper: WrapperHandler = async () => async () => undefined;

export default {
  name: "dummy",
  handler: dummyWrapper,
  supportStreaming: false,
};
