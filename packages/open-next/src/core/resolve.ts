import {
  BaseEventOrResult,
  Converter,
  DefaultOverrideOptions,
  InternalEvent,
  InternalResult,
  OverrideOptions,
  Wrapper,
} from "types/open-next.js";

import { TagCache } from "../cache/tag/types.js";

// TODO: We should probably use open-next plugins here to avoid bundling unnecessary code

export async function resolveConverter<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(
  converter: DefaultOverrideOptions<E, R>["converter"],
  defaultConverter: string = "aws-apigw-v2",
): Promise<Converter<E, R>> {
  if (typeof converter === "string") {
    const m = await import(`../converters/${converter}.js`);
    return m.default;
  } else if (typeof converter === "function") {
    return converter();
  } else {
    const m_1 = await import(`../converters/${defaultConverter}.js`);
    return m_1.default;
  }
}

export async function resolveWrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(wrapper: DefaultOverrideOptions<E, R>["wrapper"]): Promise<Wrapper<E, R>> {
  if (typeof wrapper === "string") {
    const m = await import(`../wrappers/${wrapper}.js`);
    return m.default;
  } else if (typeof wrapper === "function") {
    return wrapper();
  } else {
    const m_1 = await import("../wrappers/aws-lambda.js");
    // @ts-expect-error
    return m_1.default;
  }
}

export async function resolveTagCache(
  tagCache: OverrideOptions["tagCache"],
): Promise<TagCache> {
  if (typeof tagCache === "string") {
    const m = await import(`../cache/tag/${tagCache}.js`);
    return m.default;
  } else if (typeof tagCache === "function") {
    return tagCache();
  } else {
    const m_1 = await import("../cache/tag/dynamoDb.js");
    return m_1.default;
  }
}
