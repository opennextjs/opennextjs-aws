import * as fs from "node:fs";
import path from "node:path";

import {
  BaseOverride,
  DefaultOverrideOptions,
  FunctionOptions,
  LazyLoadedOverride,
  OpenNextConfig,
  OverrideOptions,
} from "types/open-next";

import { getBuildId } from "./helper.js";

type BaseFunction = {
  handler: string;
  bundle: string;
};

type OpenNextFunctionOrigin = {
  type: "function";
  streaming?: boolean;
  wrapper: string;
  converter: string;
} & BaseFunction;

type OpenNextECSOrigin = {
  type: "ecs";
  bundle: string;
  wrapper: string;
  converter: string;
  dockerfile: string;
};

type CommonOverride = {
  queue: string;
  incrementalCache: string;
  tagCache: string;
};

type OpenNextServerFunctionOrigin = OpenNextFunctionOrigin & CommonOverride;
type OpenNextServerECSOrigin = OpenNextECSOrigin & CommonOverride;

type OpenNextS3Origin = {
  type: "s3";
  originPath: string;
  copy: {
    from: string;
    to: string;
    cached: boolean;
    versionedSubDir?: string;
  }[];
};

type OpenNextOrigins =
  | OpenNextServerFunctionOrigin
  | OpenNextServerECSOrigin
  | OpenNextS3Origin;

type ImageFnOrigins = OpenNextFunctionOrigin & { imageLoader: string };
type ImageECSOrigins = OpenNextECSOrigin & { imageLoader: string };

type ImageOrigins = ImageFnOrigins | ImageECSOrigins;

type DefaultOrigins = {
  s3: OpenNextS3Origin;
  default: OpenNextServerFunctionOrigin | OpenNextServerECSOrigin;
  imageOptimizer: ImageOrigins;
};

interface OpenNextOutput {
  edgeFunctions: {
    [key: string]: BaseFunction;
  } & {
    middleware?: BaseFunction & { pathResolver: string };
  };
  origins: DefaultOrigins & {
    [key: string]: OpenNextOrigins;
  };
  behaviors: {
    pattern: string;
    origin?: string;
    edgeFunction?: string;
  }[];
  additionalProps?: {
    disableIncrementalCache?: boolean;
    disableTagCache?: boolean;
    initializationFunction?: BaseFunction;
    warmer?: BaseFunction;
    revalidationFunction?: BaseFunction;
  };
}

async function canStream(opts: FunctionOptions) {
  if (!opts.override?.wrapper) {
    return false;
  } else {
    if (typeof opts.override.wrapper === "string") {
      return opts.override.wrapper === "aws-lambda-streaming";
    } else {
      const wrapper = await opts.override.wrapper();
      return wrapper.supportStreaming;
    }
  }
}

async function extractOverrideName(
  defaultName: string,
  override?: LazyLoadedOverride<BaseOverride> | string,
) {
  if (!override) {
    return defaultName;
  }
  if (typeof override === "string") {
    return override;
  } else {
    const overrideModule = await override();
    return overrideModule.name;
  }
}

async function extractOverrideFn(override?: DefaultOverrideOptions) {
  if (!override) {
    return {
      wrapper: "aws-lambda",
      converter: "aws-apigw-v2",
    };
  }
  const wrapper = await extractOverrideName("aws-lambda", override.wrapper);
  const converter = await extractOverrideName(
    "aws-apigw-v2",
    override.converter,
  );
  return { wrapper, converter };
}

async function extractCommonOverride(override?: OverrideOptions) {
  if (!override) {
    return {
      queue: "sqs",
      incrementalCache: "s3",
      tagCache: "dynamodb",
    };
  }
  const queue = await extractOverrideName("sqs", override.queue);
  const incrementalCache = await extractOverrideName(
    "s3",
    override.incrementalCache,
  );
  const tagCache = await extractOverrideName("dynamodb", override.tagCache);
  return { queue, incrementalCache, tagCache };
}

export async function generateOutput(
  outputPath: string,
  config: OpenNextConfig,
) {
  const edgeFunctions: OpenNextOutput["edgeFunctions"] = {};
  const isExternalMiddleware = config.middleware?.external ?? false;
  if (isExternalMiddleware) {
    edgeFunctions.middleware = {
      bundle: ".open-next/middleware",
      handler: "handler.handler",
      pathResolver: await extractOverrideName(
        "pattern-env",
        config.middleware!.originResolver,
      ),
      ...(await extractOverrideFn(config.middleware?.override)),
    };
  }
  // Add edge functions
  Object.entries(config.functions ?? {}).forEach(async ([key, value]) => {
    if (value.placement === "global") {
      edgeFunctions[key] = {
        bundle: `.open-next/functions/${key}`,
        handler: "index.handler",
        ...(await extractOverrideFn(value.override)),
      };
    }
  });

  const defaultOriginCanstream = await canStream(config.default);

  // First add s3 origins and image optimization

  const defaultOrigins: DefaultOrigins = {
    s3: {
      type: "s3",
      originPath: "_assets",
      copy: [
        {
          from: ".open-next/assets",
          to: "_assets",
          cached: true,
          versionedSubDir: "_next",
        },
        ...(config.dangerous?.disableIncrementalCache
          ? []
          : [
              {
                from: ".open-next/cache",
                to: "_cache",
                cached: false,
              },
            ]),
      ],
    },
    imageOptimizer: {
      type: "function",
      handler: "index.handler",
      bundle: ".open-next/image-optimization-function",
      streaming: false,
      imageLoader: await extractOverrideName(
        "s3",
        config.imageOptimization?.loader,
      ),
      ...(await extractOverrideFn(config.imageOptimization?.override)),
    },
    default: config.default.override?.generateDockerfile
      ? {
          type: "ecs",
          bundle: ".open-next/server-functions/default",
          dockerfile: ".open-next/server-functions/default/Dockerfile",
          ...(await extractOverrideFn(config.default.override)),
          ...(await extractCommonOverride(config.default.override)),
        }
      : {
          type: "function",
          handler: "index.handler",
          bundle: ".open-next/server-functions/default",
          streaming: defaultOriginCanstream,
          ...(await extractOverrideFn(config.default.override)),
          ...(await extractCommonOverride(config.default.override)),
        },
  };

  //@ts-expect-error - Not sure how to fix typing here, it complains about the type of imageOptimizer and s3
  const origins: OpenNextOutput["origins"] = defaultOrigins;

  // Then add function origins
  await Promise.all(
    Object.entries(config.functions ?? {}).map(async ([key, value]) => {
      if (!value.placement || value.placement === "regional") {
        if (value.override?.generateDockerfile) {
          origins[key] = {
            type: "ecs",
            bundle: `.open-next/server-functions/${key}`,
            dockerfile: `.open-next/server-functions/${key}/Dockerfile`,
            ...(await extractOverrideFn(value.override)),
            ...(await extractCommonOverride(value.override)),
          };
        } else {
          const streaming = await canStream(value);
          origins[key] = {
            type: "function",
            handler: "index.handler",
            bundle: `.open-next/server-functions/${key}`,
            streaming,
            ...(await extractOverrideFn(value.override)),
            ...(await extractCommonOverride(value.override)),
          };
        }
      }
    }),
  );

  // Then we need to compute the behaviors
  const behaviors: OpenNextOutput["behaviors"] = [
    { pattern: "_next/image*", origin: "imageOptimizer" },
  ];

  // Then we add the routes
  Object.entries(config.functions ?? {}).forEach(([key, value]) => {
    const patterns = "patterns" in value ? value.patterns : ["*"];
    patterns.forEach((pattern) => {
      behaviors.push({
        pattern: pattern.replace(/BUILD_ID/, getBuildId(outputPath)),
        origin: value.placement === "global" ? undefined : key,
        edgeFunction:
          value.placement === "global"
            ? key
            : isExternalMiddleware
            ? "middleware"
            : undefined,
      });
    });
  });

  // We finish with the default behavior so that they don't override the others
  behaviors.push({
    pattern: "_next/data/*",
    origin: "default",
    edgeFunction: isExternalMiddleware ? "middleware" : undefined,
  });
  behaviors.push({
    pattern: "*",
    origin: "default",
    edgeFunction: isExternalMiddleware ? "middleware" : undefined,
  });

  //Compute behaviors for assets files
  const assetPath = path.join(outputPath, ".open-next", "assets");
  fs.readdirSync(assetPath).forEach((item) => {
    if (fs.statSync(path.join(assetPath, item)).isDirectory()) {
      behaviors.push({
        pattern: `${item}/*`,
        origin: "s3",
      });
    } else {
      behaviors.push({
        pattern: item,
        origin: "s3",
      });
    }
  });

  const output: OpenNextOutput = {
    edgeFunctions,
    origins,
    behaviors,
    additionalProps: {
      disableIncrementalCache: config.dangerous?.disableIncrementalCache,
      disableTagCache: config.dangerous?.disableTagCache,
      warmer: {
        handler: "index.handler",
        bundle: ".open-next/warmer-function",
      },
      initializationFunction: config.dangerous?.disableTagCache
        ? undefined
        : {
            handler: "index.handler",
            bundle: ".open-next/initialization-function",
          },
      revalidationFunction: config.dangerous?.disableIncrementalCache
        ? undefined
        : {
            handler: "index.handler",
            bundle: ".open-next/revalidation-function",
          },
    },
  };
  fs.writeFileSync(
    path.join(outputPath, ".open-next", "open-next.output.json"),
    JSON.stringify(output),
  );
}
