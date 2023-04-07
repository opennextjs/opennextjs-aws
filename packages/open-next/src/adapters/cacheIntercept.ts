import { PrerenderManifest, revalidateInBackground } from "./util.js";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { request as httpsRequest } from "https";

interface MatchedRoute {
  key: string;
  route: string;
  // srcRoute: string;
  revalidate: number;
}

interface CompiledDynamicRoute {
  routeRegex: RegExp;
  dataRouteRegex: RegExp;
  srcRoute: string;
}

interface ProxyEvent {
  rawPath: string;
  headers: Record<string, string>;
  method: string;
  domainName: string;
}

interface ProxyResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded: boolean;
}

interface TypeMatcher {
  html: string;
  json: string;
  rsc: string;
}

const DEFAULT_REVALIDATE = 365 * 24 * 60 * 60;

export class CacheInterceptor {
  buildId: string;
  s3 = new S3Client({ region: process.env.CACHE_BUCKET_REGION });
  revalidates = new Map<string, number>();
  prerenderedRoutes: MatchedRoute[] = [];
  compiledDynamicRoutes: CompiledDynamicRoute[] = [];
  preview: string;
  constructor({ routes, dynamicRoutes, preview }: PrerenderManifest, buildId: string) {
    const startTime = Date.now();
    this.buildId = buildId;
    Object.entries(routes).forEach(
      ([route, { srcRoute, initialRevalidateSeconds, dataRoute }]) => {
        const _initialRevalidateSeconds =
          typeof initialRevalidateSeconds === "boolean"
            ? DEFAULT_REVALIDATE // 1 year
            : initialRevalidateSeconds;
        this.revalidates.set(srcRoute ?? route, _initialRevalidateSeconds);
        this.prerenderedRoutes.push({
          key: route === "/" ? "/index" : route,
          route,
          revalidate: _initialRevalidateSeconds,
        });
        this.prerenderedRoutes.push({
          key: route === "/" ? "/index" : route,
          route: dataRoute,
          revalidate: _initialRevalidateSeconds,
        });
      }
    );

    Object.entries(dynamicRoutes).forEach(
      ([srcRoute, { routeRegex, dataRouteRegex }]) => {
        this.compiledDynamicRoutes.push({
          routeRegex: new RegExp(routeRegex),
          dataRouteRegex: new RegExp(dataRouteRegex),
          srcRoute,
        });
      }
    );

    this.preview = preview["previewModeId"];

    console.log("Lambda initialized in", Date.now() - startTime, "ms");
  }
  parsePath(path: string) {
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const hasQuery = queryIndex > -1 && (hashIndex < 0 || queryIndex < hashIndex);
    let _path = path;

    const isDataRoute = path.startsWith(`/_next/data/${this.buildId}`);

    if (hasQuery || hashIndex > -1) {
      _path = path.substring(0, hasQuery ? queryIndex : hashIndex);
    }

    if (isDataRoute) {
      _path = _path.replace(`/_next/data/${this.buildId}`, "");
      _path = _path.replace(/\.json$/, "");
    }

    return _path;
  }

  matcher = (url: string): MatchedRoute | null => {
    const route = this.prerenderedRoutes.find((r) => r.route === url);
    if (route) {
      return route;
    }
    const foundCompiled = this.compiledDynamicRoutes.find((r) => {
      let match = r.routeRegex.exec(url);
      if (match) {
        return true;
      }
      match = r.dataRouteRegex.exec(url);
      if (match) {
        return true;
      }
      return false;
    })?.srcRoute;
    if (foundCompiled) {
      const key = this.parsePath(url);
      return {
        key,
        route: url,
        revalidate: this.revalidates.get(foundCompiled) ?? DEFAULT_REVALIDATE,
      };
    }
    return null;
  };

  async handler(event: ProxyEvent): Promise<ProxyResult | false> {
    const startTime = Date.now();
    // const request = event.Records[0].cf.request;
    const uri = event.rawPath;
    if (event.headers["x-prerender-revalidate"] === this.preview) {
      return false;
    }

    console.log("Matched uri:", uri);

    const matchedRoute = this.matcher(uri);
    const method = event.method;
    if (method !== "GET" && method !== "HEAD") {
      return false;
    }
    if (matchedRoute) {
      const { revalidate, key } = matchedRoute;
      const isDataRoute = uri.startsWith("/_next/data");
      const isRscRoute = event.headers.rsc === "1";

      const byType = ({ html, json, rsc }: TypeMatcher) =>
        isDataRoute ? json : isRscRoute ? rsc : html;

      try {
        const bucketName = process.env.CACHE_BUCKET_NAME;
        const { Body, LastModified } = await this.s3.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: `${this.buildId}${key}${byType({
              html: ".html",
              json: ".json",
              rsc: ".rsc",
            })}`,
          })
        );
        if (!Body) throw new Error("No body found in s3 response.");
        if (!LastModified) throw new Error("No LastModified found in s3 response.");

        const body = await Body.transformToString();
        let isStale = false;
        const expirationDate = LastModified.getTime() + revalidate * 1000;
        const now = Date.now();
        const remaining = ((expirationDate - now) / 1000).toFixed(0);

        if (expirationDate < now) {
          // Stale, revalidate
          await revalidateInBackground(event.domainName, uri, this.preview);
          isStale = true;
        }

        console.log(`Serving ${uri} from s3 cache in ${Date.now() - startTime}ms`);
        return {
          statusCode: 200,
          body: method === "GET" ? body : "",
          headers: {
            "Content-Type": byType({
              html: "text/html",
              json: "application/json",
              rsc: "text/x-component",
            }),
            "Cache-Control": isStale
              ? "s-maxage=0"
              : `s-maxage=${remaining}, stale-while-revalidate`,
          },
          isBase64Encoded: false,
        };
      } catch (e) {
        console.error(e);
        return false;
      }
    }
    console.log(`Serving ${uri} from origin in ${Date.now() - startTime}ms`);
    return false;
  }
}
