import type { Wrapper, WrapperHandler } from "types/overrides";

const dummyWrapper: WrapperHandler = async () => async () => undefined;

export default {
  name: "dummy",
  wrapper: dummyWrapper,
  supportStreaming: false,
} satisfies Wrapper;
