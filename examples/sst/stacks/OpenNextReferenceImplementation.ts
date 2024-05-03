import { execSync } from "node:child_process";

import {
  AllowedMethods,
  BehaviorOptions,
  CacheCookieBehavior,
  CachedMethods,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  Distribution,
  Function as CloudfrontFunction,
  FunctionCode,
  FunctionEventType,
  ICachePolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  AttributeType,
  Billing,
  TableV2 as Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  Code,
  Function as CdkFunction,
  FunctionUrlAuthType,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Queue } from "aws-cdk-lib/aws-sqs";
import {
  CustomResource,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib/core";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { readFileSync } from "fs";
import path from "path";
import { Stack as SSTStack } from "sst/constructs";

type BaseFunction = {
  handler: string;
  bundle: string;
};

type OpenNextFunctionOrigin = {
  type: "function";
  streaming?: boolean;
} & BaseFunction;

type OpenNextECSOrigin = {
  type: "ecs";
  bundle: string;
  dockerfile: string;
};

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
  | OpenNextFunctionOrigin
  | OpenNextECSOrigin
  | OpenNextS3Origin;

interface OpenNextOutput {
  edgeFunctions: {
    [key: string]: BaseFunction;
  };
  origins: {
    s3: OpenNextS3Origin;
    default: OpenNextFunctionOrigin | OpenNextECSOrigin;
    imageOptimizer: OpenNextFunctionOrigin | OpenNextECSOrigin;
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

interface OpenNextCdkReferenceImplementationProps {
  path: string;
}

export class OpenNextCdkReferenceImplementation extends Construct {
  private openNextOutput: OpenNextOutput;
  private openNextBasePath: string;
  private bucket: Bucket;
  private table: Table;
  private queue: Queue;

  private staticCachePolicy: ICachePolicy;
  private serverCachePolicy: CachePolicy;

  public distribution: Distribution;

  constructor(
    scope: Construct,
    id: string,
    props: OpenNextCdkReferenceImplementationProps,
  ) {
    super(scope, id);
    this.openNextBasePath = path.join(process.cwd(), props.path);
    execSync("npm run openbuild", {
      cwd: path.join(process.cwd(), props.path),
      stdio: "inherit",
    });

    this.openNextOutput = JSON.parse(
      readFileSync(
        path.join(this.openNextBasePath, ".open-next/open-next.output.json"),
        "utf-8",
      ),
    ) as OpenNextOutput;

    this.bucket = new Bucket(this, "OpenNextBucket", {
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
    });
    this.table = this.createRevalidationTable();
    this.queue = this.createRevalidationQueue();

    const origins = this.createOrigins();
    this.serverCachePolicy = this.createServerCachePolicy();
    this.staticCachePolicy = this.createStaticCachePolicy();
    this.distribution = this.createDistribution(origins);
    this.createInvalidation();
  }

  private createRevalidationTable() {
    const table = new Table(this, "RevalidationTable", {
      partitionKey: { name: "tag", type: AttributeType.STRING },
      sortKey: { name: "path", type: AttributeType.STRING },
      pointInTimeRecovery: true,
      billing: Billing.onDemand(),
      globalSecondaryIndexes: [
        {
          indexName: "revalidate",
          partitionKey: { name: "path", type: AttributeType.STRING },
          sortKey: { name: "revalidatedAt", type: AttributeType.NUMBER },
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const initFn = this.openNextOutput.additionalProps?.initializationFunction;
    if (initFn) {
      const insertFn = new CdkFunction(this, "RevalidationInsertFunction", {
        description: "Next.js revalidation data insert",
        handler: initFn?.handler ?? "index.handler",
        // code: Code.fromAsset(initFn?.bundle ?? ""),
        code: Code.fromAsset(
          path.join(this.openNextBasePath, ".open-next/dynamodb-provider"),
        ),
        runtime: Runtime.NODEJS_18_X,
        timeout: Duration.minutes(15),
        memorySize: 128,
        environment: {
          CACHE_DYNAMO_TABLE: table.tableName,
        },
        initialPolicy: [
          new PolicyStatement({
            actions: [
              "dynamodb:BatchWriteItem",
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
            ],
            resources: [table.tableArn],
          }),
        ],
      });

      const customResource = new AwsCustomResource(
        this,
        "RevalidationInitResource",
        {
          onUpdate: {
            service: "Lambda",
            action: "invoke",
            parameters: {
              FunctionName: insertFn.functionName,
            },
            physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
          },

          policy: AwsCustomResourcePolicy.fromStatements([
            new PolicyStatement({
              actions: ["lambda:InvokeFunction"],
              resources: [insertFn.functionArn],
            }),
          ]),
        },
      );
      customResource.node.addDependency(insertFn);
    }

    return table;
  }

  private createOrigins() {
    const {
      s3: s3Origin,
      default: defaultOrigin,
      imageOptimizer: imageOrigin,
      ...restOrigins
    } = this.openNextOutput.origins;
    for (const copy of s3Origin.copy) {
      new BucketDeployment(this, `OpenNextBucketDeployment${copy.from}`, {
        sources: [Source.asset(path.join(this.openNextBasePath, copy.from))],
        destinationBucket: this.bucket,
        destinationKeyPrefix: copy.to,
        prune: false,
      });
    }
    const origins = {
      s3: new S3Origin(this.bucket, {
        originPath: s3Origin.originPath,
        originAccessIdentity: undefined,
      }),
      default:
        defaultOrigin.type === "function"
          ? this.createFunctionOrigin("default", defaultOrigin)
          : this.createAppRunnerOrigin("default", defaultOrigin),
      imageOptimizer:
        imageOrigin.type === "function"
          ? this.createFunctionOrigin("imageOptimizer", imageOrigin)
          : this.createAppRunnerOrigin("imageOptimizer", imageOrigin),
      ...Object.entries(restOrigins).reduce(
        (acc, [key, value]) => {
          if (value.type === "function") {
            acc[key] = this.createFunctionOrigin(key, value);
            // eslint-disable-next-line sonarjs/elseif-without-else
          } else if (value.type === "ecs") {
            acc[key] = this.createAppRunnerOrigin(key, value);
          }
          return acc;
        },
        {} as Record<string, HttpOrigin>,
      ),
    };
    return origins;
  }

  private createRevalidationQueue() {
    const queue = new Queue(this, "RevalidationQueue", {
      fifo: true,
      receiveMessageWaitTime: Duration.seconds(20),
    });
    const consumer = new CdkFunction(this, "RevalidationFunction", {
      description: "Next.js revalidator",
      handler: "index.handler",
      code: Code.fromAsset(
        path.join(
          this.openNextBasePath,
          this.openNextOutput.additionalProps?.revalidationFunction?.bundle ??
            "",
        ),
      ),
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
    });
    consumer.addEventSource(new SqsEventSource(queue, { batchSize: 5 }));
    return queue;
  }

  private getEnvironment() {
    return {
      CACHE_BUCKET_NAME: this.bucket.bucketName,
      CACHE_BUCKET_KEY_PREFIX: "_cache",
      CACHE_BUCKET_REGION: Stack.of(this).region,
      REVALIDATION_QUEUE_URL: this.queue.queueUrl,
      REVALIDATION_QUEUE_REGION: Stack.of(this).region,
      CACHE_DYNAMO_TABLE: this.table.tableName,
      // Those 2 are used only for image optimizer
      BUCKET_NAME: this.bucket.bucketName,
      BUCKET_KEY_PREFIX: "_assets",
    };
  }

  private grantPermissions(grantable: IGrantable) {
    this.bucket.grantReadWrite(grantable);
    this.table.grantReadWriteData(grantable);
    this.queue.grantSendMessages(grantable);
  }

  private createFunctionOrigin(key: string, origin: OpenNextFunctionOrigin) {
    const environment = this.getEnvironment();
    const fn = new CdkFunction(this, `${key}Function`, {
      architecture: Architecture.ARM_64,
      runtime: Runtime.NODEJS_18_X,
      handler: origin.handler,
      code: Code.fromAsset(path.join(this.openNextBasePath, origin.bundle)),
      environment,
      memorySize: 1024,
      timeout: Duration.seconds(20),
    });
    const fnUrl = fn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode: origin.streaming
        ? InvokeMode.RESPONSE_STREAM
        : InvokeMode.BUFFERED,
    });
    this.grantPermissions(fn);
    return new HttpOrigin(Fn.parseDomainName(fnUrl.url));
  }

  // We are using AppRunner because it is the easiest way to demonstrate the new feature.
  // You can use any other container service like ECS, EKS, Fargate, etc.
  private createAppRunnerOrigin(
    _key: string,
    _origin: OpenNextECSOrigin,
  ): HttpOrigin {
    throw new Error("Not implemented");
  }

  private createDistribution(origins: Record<string, HttpOrigin | S3Origin>) {
    const cloudfrontFunction = new CloudfrontFunction(
      this,
      "OpenNextCfFunction",
      {
        code: FunctionCode.fromInline(`
			function handler(event) {
				var request = event.request;
				request.headers["x-forwarded-host"] = request.headers.host;
				return request;
			}
			`),
      },
    );
    const fnAssociations = [
      {
        function: cloudfrontFunction,
        eventType: FunctionEventType.VIEWER_REQUEST,
      },
    ];

    const distribution = new Distribution(this, "OpenNextDistribution", {
      defaultBehavior: {
        origin: origins.default,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: this.serverCachePolicy,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: fnAssociations,
      },
      additionalBehaviors: this.openNextOutput.behaviors
        .filter((b) => b.pattern !== "*")
        .reduce(
          (acc, behavior) => {
            return {
              ...acc,
              [behavior.pattern]: {
                origin: behavior.origin
                  ? origins[behavior.origin]
                  : origins.default,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cachePolicy:
                  behavior.origin === "s3"
                    ? this.staticCachePolicy
                    : this.serverCachePolicy,
                originRequestPolicy:
                  behavior.origin === "s3"
                    ? undefined
                    : OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                functionAssociations: fnAssociations,
              },
            };
          },
          {} as Record<string, BehaviorOptions>,
        ),
    });
    return distribution;
  }

  private createInvalidation() {
    const stack = SSTStack.of(this) as SSTStack;
    const policy = new Policy(this, "OpenNextInvalidationPolicy", {
      statements: [
        new PolicyStatement({
          actions: [
            "cloudfront:CreateInvalidation",
            "cloudfront:GetInvalidation",
          ],
          resources: [
            `arn:${stack.partition}:cloudfront::${stack.account}:distribution/${this.distribution.distributionId}`,
          ],
        }),
      ],
    });

    stack.customResourceHandler.role?.attachInlinePolicy(policy);
    const resource = new CustomResource(this, "OpenNextInvalidationResource", {
      serviceToken: stack.customResourceHandler.functionArn,
      resourceType: "Custom::CloudFrontInvalidator",
      properties: {
        version: Date.now().toString(16) + Math.random().toString(16).slice(2),
        distributionId: this.distribution.distributionId,
        paths: ["/*"],
        wait: true,
      },
    });
    resource.node.addDependency(policy);
  }

  private createServerCachePolicy() {
    return new CachePolicy(this, "OpenNextServerCachePolicy", {
      queryStringBehavior: CacheQueryStringBehavior.all(),
      headerBehavior: CacheHeaderBehavior.allowList(
        "accept",
        "rsc",
        "next-router-prefetch",
        "next-router-state-tree",
        "next-url",
        "x-prerender-revalidate",
      ),
      cookieBehavior: CacheCookieBehavior.none(),
      defaultTtl: Duration.days(0),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(0),
    });
  }

  private createStaticCachePolicy() {
    return CachePolicy.CACHING_OPTIMIZED;
  }
}
