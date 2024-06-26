import {
  BaseEventOrResult,
  Converter,
  DefaultOverrideOptions,
  ImageLoader,
  InternalEvent,
  InternalResult,
  LazyLoadedOverride,
  OverrideOptions,
  Wrapper,
} from "types/open-next.js";

import { TagCache } from "../cache/tag/types.js";

export async function resolveConverter<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(
  converter: DefaultOverrideOptions<E, R>["converter"],
): Promise<Converter<E, R>> {
  if (typeof converter === "function") {
    return converter();
  } else {
    const m_1 = await import(`../converters/aws-apigw-v2.js`);
    // @ts-expect-error
    return m_1.default;
  }
}

export async function resolveWrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(wrapper: DefaultOverrideOptions<E, R>["wrapper"]): Promise<Wrapper<E, R>> {
  if (typeof wrapper === "function") {
    return wrapper();
  } else {
    // This will be replaced by the bundler
    const m_1 = await import("../wrappers/aws-lambda.js");
    // @ts-expect-error
    return m_1.default;
  }
}

/**
 *
 * @param tagCache
 * @returns
 * @__PURE__
 */
export async function resolveTagCache(
  tagCache: OverrideOptions["tagCache"],
): Promise<TagCache> {
  if (typeof tagCache === "function") {
    return tagCache();
  } else {
    // This will be replaced by the bundler
    const m_1 = await import("../cache/tag/dynamodb.js");
    return m_1.default;
  }
}

/**
 *
 * @param queue
 * @returns
 * @__PURE__
 */
export async function resolveQueue(queue: OverrideOptions["queue"]) {
  if (typeof queue === "function") {
    return queue();
  } else {
    const m_1 = await import("../queue/sqs.js");
    return m_1.default;
  }
}

/**
 *
 * @param incrementalCache
 * @returns
 * @__PURE__
 */
export async function resolveIncrementalCache(
  incrementalCache: OverrideOptions["incrementalCache"],
) {
  if (typeof incrementalCache === "function") {
    return incrementalCache();
  } else {
    const m_1 = await import("../cache/incremental/s3.js");
    return m_1.default;
  }
}

/**
 * @param imageLoader
 * @returns
 * @__PURE__
 */
export async function resolveImageLoader(
  imageLoader: LazyLoadedOverride<ImageLoader> | string,
) {
  if (typeof imageLoader === "function") {
    return imageLoader();
  } else {
    const m_1 = await import("../overrides/imageLoader/s3.js");
    return m_1.default;
  }
}
