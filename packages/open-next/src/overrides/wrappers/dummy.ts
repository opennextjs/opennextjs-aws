import type { WrapperHandler } from "types/open-next";

const dummyWrapper: WrapperHandler = async () => async () => undefined;

export default {
  name: "dummy",
  handler: dummyWrapper,
  supportStreaming: false,
};
