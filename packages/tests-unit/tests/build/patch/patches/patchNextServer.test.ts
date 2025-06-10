import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  createEmptyBodyRule,
  disablePreloadingRule,
  errorInspectRule,
  removeMiddlewareManifestRule,
} from "@opennextjs/aws/build/patch/patches/patchNextServer.js";
import { describe, it } from "vitest";

const nextServerGetMiddlewareManifestCode = `
class NextNodeServer extends _baseserver.default {
getMiddlewareManifest() {
        if (this.minimalMode) {
            return null;
        } else {
            const manifest = require(this.middlewareManifestPath);
            return manifest;
        }
    }
}
`;

const next15ServerMinimalCode = `
class NextNodeServer extends _baseserver.default {
constructor(options){
        var _options_conf_experimental_sri, _options_conf_experimental;
        // Initialize super class
        super(options), this.registeredInstrumentation = false, this.cleanupListeners = new _asynccallbackset.AsyncCallbackSet(), this.handleNextImageRequest = async (req, res, parsedUrl)=>{
            if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith('/_next/image')) {
                return false;
            }
            // Ignore if its a middleware request
            if ((0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke')) {
                return false;
            }
            if (this.minimalMode || this.nextConfig.output === 'export' || process.env.NEXT_MINIMAL) {
                res.statusCode = 400;
                res.body('Bad Request').send();
                return true;
            // the \`else\` branch is needed for tree-shaking
            } else {
                const { ImageOptimizerCache } = require('./image-optimizer');
                const imageOptimizerCache = new ImageOptimizerCache({
                    distDir: this.distDir,
                    nextConfig: this.nextConfig
                });
                const { sendResponse, ImageError } = require('./image-optimizer');
                if (!this.imageResponseCache) {
                    throw Object.defineProperty(new Error('invariant image optimizer cache was not initialized'), "__NEXT_ERROR_CODE", {
                        value: "E160",
                        enumerable: false,
                        configurable: true
                    });
                }
                const imagesConfig = this.nextConfig.images;
                if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
                    await this.render404(req, res);
                    return true;
                }
                const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                if ('errorMessage' in paramsResult) {
                    res.statusCode = 400;
                    res.body(paramsResult.errorMessage).send();
                    return true;
                }
                const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                try {
                    var _cacheEntry_value, _cacheEntry_cacheControl;
                    const { getExtension } = require('./serve-static');
                    const cacheEntry = await this.imageResponseCache.get(cacheKey, async ({ previousCacheEntry })=>{
                        const { buffer, contentType, maxAge, upstreamEtag, etag } = await this.imageOptimizer(req, res, paramsResult, previousCacheEntry);
                        return {
                            value: {
                                kind: _responsecache.CachedRouteKind.IMAGE,
                                buffer,
                                etag,
                                extension: getExtension(contentType),
                                upstreamEtag
                            },
                            isFallback: false,
                            cacheControl: {
                                revalidate: maxAge,
                                expire: undefined
                            }
                        };
                    }, {
                        routeKind: _routekind.RouteKind.IMAGE,
                        incrementalCache: imageOptimizerCache,
                        isFallback: false
                    });
                    if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== _responsecache.CachedRouteKind.IMAGE) {
                        throw Object.defineProperty(new Error('invariant did not get entry from image response cache'), "__NEXT_ERROR_CODE", {
                            value: "E518",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, cacheEntry.value.etag, paramsResult.isStatic, cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT', imagesConfig, ((_cacheEntry_cacheControl = cacheEntry.cacheControl) == null ? void 0 : _cacheEntry_cacheControl.revalidate) || 0, Boolean(this.renderOpts.dev));
                    return true;
                } catch (err) {
                    if (err instanceof ImageError) {
                        res.statusCode = err.statusCode;
                        res.body(err.message).send();
                        return true;
                    }
                    throw err;
                }
            }
        }, this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
            let { pathname, query } = parsedUrl;
            if (!pathname) {
                throw Object.defineProperty(new Error('Invariant: pathname is undefined'), "__NEXT_ERROR_CODE", {
                    value: "E409",
                    enumerable: false,
                    configurable: true
                });
            }
            // This is a catch-all route, there should be no fallbacks so mark it as
            // such.
            (0, _requestmeta.addRequestMeta)(req, 'bubbleNoFallback', true);
            try {
                var _this_i18nProvider;
                // next.js core assumes page path without trailing slash
                pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                const options = {
                    i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromRequest(req, pathname)
                };
                const match = await this.matchers.match(pathname, options);
                // If we don't have a match, try to render it anyways.
                if (!match) {
                    await this.render(req, res, pathname, query, parsedUrl, true);
                    return true;
                }
                // Add the match to the request so we don't have to re-run the matcher
                // for the same request.
                (0, _requestmeta.addRequestMeta)(req, 'match', match);
                // TODO-APP: move this to a route handler
                const edgeFunctionsPages = this.getEdgeFunctionsPages();
                for (const edgeFunctionsPage of edgeFunctionsPages){
                    // If the page doesn't match the edge function page, skip it.
                    if (edgeFunctionsPage !== match.definition.page) continue;
                    if (this.nextConfig.output === 'export') {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                    // If we handled the request, we can return early.
                    // For api routes edge runtime
                    try {
                        const handled = await this.runEdgeFunction({
                            req,
                            res,
                            query,
                            params: match.params,
                            page: match.definition.page,
                            match,
                            appPaths: null
                        });
                        if (handled) return true;
                    } catch (apiError) {
                        await this.instrumentationOnRequestError(apiError, req, {
                            routePath: match.definition.page,
                            routerKind: 'Pages Router',
                            routeType: 'route',
                            // Edge runtime does not support ISR
                            revalidateReason: undefined
                        });
                        throw apiError;
                    }
                }
                // If the route was detected as being a Pages API route, then handle
                // it.
                // TODO: move this behavior into a route handler.
                if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                    if (this.nextConfig.output === 'export') {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    const handled = await this.handleApiRequest(req, res, query, match);
                    if (handled) return true;
                }
                await this.render(req, res, pathname, query, parsedUrl, true);
                return true;
            } catch (err) {
                if (err instanceof _baseserver.NoFallbackError) {
                    throw err;
                }
                try {
                    if (this.renderOpts.dev) {
                        const { formatServerError } = require('../lib/format-server-error');
                        formatServerError(err);
                        this.logErrorWithOriginalStack(err);
                    } else {
                        this.logError(err);
                    }
                    res.statusCode = 500;
                    await this.renderError(err, req, res, pathname, query);
                    return true;
                } catch  {}
                throw err;
            }
        }, this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
            const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke');
            if (!isMiddlewareInvoke) {
                return false;
            }
            const handleFinished = ()=>{
                (0, _requestmeta.addRequestMeta)(req, 'middlewareInvoke', true);
                res.body('').send();
                return true;
            };
            const middleware = await this.getMiddleware();
            if (!middleware) {
                return handleFinished();
            }
            const initUrl = (0, _requestmeta.getRequestMeta)(req, 'initURL');
            const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
            const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                nextConfig: this.nextConfig,
                i18nProvider: this.i18nProvider
            });
            parsedUrl.pathname = pathnameInfo.pathname;
            const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || '');
            if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                return handleFinished();
            }
            let result;
            let bubblingResult = false;
            try {
                await this.ensureMiddleware(req.url);
                result = await this.runMiddleware({
                    request: req,
                    response: res,
                    parsedUrl: parsedUrl,
                    parsed: parsed
                });
                if ('response' in result) {
                    if (isMiddlewareInvoke) {
                        bubblingResult = true;
                        throw Object.defineProperty(new _tracer.BubbledError(true, result), "__NEXT_ERROR_CODE", {
                            value: "E394",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                        if (key !== 'content-encoding' && value !== undefined) {
                            res.setHeader(key, value);
                        }
                    }
                    res.statusCode = result.response.status;
                    const { originalResponse } = res;
                    if (result.response.body) {
                        await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                    } else {
                        originalResponse.end();
                    }
                    return true;
                }
            } catch (err) {
                if (bubblingResult) {
                    throw err;
                }
                if ((0, _iserror.default)(err) && err.code === 'ENOENT') {
                    await this.render404(req, res, parsed);
                    return true;
                }
                if (err instanceof _utils.DecodeError) {
                    res.statusCode = 400;
                    await this.renderError(err, req, res, parsed.pathname || '');
                    return true;
                }
                const error = (0, _iserror.getProperError)(err);
                console.error(error);
                res.statusCode = 500;
                await this.renderError(error, req, res, parsed.pathname || '');
                return true;
            }
            return result.finished;
        };
        console.time('Next.js server initialization');
        this.isDev = options.dev ?? false;
        this.sriEnabled = Boolean((_options_conf_experimental = options.conf.experimental) == null ? void 0 : (_options_conf_experimental_sri = _options_conf_experimental.sri) == null ? void 0 : _options_conf_experimental_sri.algorithm);
        /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * \`process.env.__NEXT_OPTIMIZE_CSS\`.
     */ if (this.renderOpts.optimizeCss) {
            process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
        }
        if (this.renderOpts.nextScriptWorkers) {
            process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
        }
        process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || '';
        if (!this.minimalMode) {
            this.imageResponseCache = new _responsecache.default(this.minimalMode);
        }
        const { appDocumentPreloading } = this.nextConfig.experimental;
        const isDefaultEnabled = typeof appDocumentPreloading === 'undefined';
        if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {
            // pre-warm _document and _app as these will be
            // needed for most requests
            (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page: '/_document',
                isAppPath: false,
                isDev: this.isDev,
                sriEnabled: this.sriEnabled
            }).catch(()=>{});
            (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page: '/_app',
                isAppPath: false,
                isDev: this.isDev,
                sriEnabled: this.sriEnabled
            }).catch(()=>{});
        }
        if (!options.dev && !this.minimalMode && this.nextConfig.experimental.preloadEntriesOnStart) {
            this.unstable_preloadEntries();
        }
        if (!options.dev) {
            const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
            this.dynamicRoutes = dynamicRoutes.map((r)=>{
                // TODO: can we just re-use the regex from the manifest?
                const regex = (0, _routeregex.getRouteRegex)(r.page);
                const match = (0, _routematcher.getRouteMatcher)(regex);
                return {
                    match,
                    page: r.page,
                    re: regex.re
                };
            });
        }
        // ensure options are set when loadConfig isn't called
        (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
        // Intercept fetch and other testmode apis.
        if (this.serverOptions.experimentalTestProxy) {
            process.env.NEXT_PRIVATE_TEST_PROXY = 'true';
            const { interceptTestApis } = require('next/dist/experimental/testmode/server');
            interceptTestApis();
        }
        this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
        // This is just optimization to fire prepare as soon as possible. It will be
        // properly awaited later. We add the catch here to ensure that it does not
        // cause a unhandled promise rejection. The promise rejection will be
        // handled later on via the \`await\` when the request handler is called.
        if (!options.dev) {
            this.prepare().catch((err)=>{
                console.error('Failed to prepare server', err);
            });
        }
        console.timeEnd('Next.js server initialization');
    }
async runMiddleware(params) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('invariant: runMiddleware should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                value: "E276",
                enumerable: false,
                configurable: true
            });
        }
        // Middleware is skipped for on-demand revalidate requests
        // REST OF THE CODE
    }
async runEdgeFunction(params) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('Middleware is not supported in minimal mode. Please remove the \`NEXT_MINIMAL\` environment variable.'), "__NEXT_ERROR_CODE", {
                value: "E58",
                enumerable: false,
                configurable: true
            });
        }
}
async imageOptimizer(req, res, paramsResult, previousCacheEntry) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('invariant: imageOptimizer should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                value: "E506",
                enumerable: false,
                configurable: true
            });
        } else {
            const { imageOptimizer, fetchExternalImage, fetchInternalImage } = require('./image-optimizer');
            const handleInternalReq = async (newReq, newRes)=>{
                if (newReq.url === req.url) {
                    throw Object.defineProperty(new Error(\`Invariant attempted to optimize _next/image itself\`), "__NEXT_ERROR_CODE", {
                        value: "E496",
                        enumerable: false,
                        configurable: true
                    });
                }
                if (!this.routerServerHandler) {
                    throw Object.defineProperty(new Error(\`Invariant missing routerServerHandler\`), "__NEXT_ERROR_CODE", {
                        value: "E317",
                        enumerable: false,
                        configurable: true
                    });
                }
                await this.routerServerHandler(newReq, newRes);
                return;
            };
            const { isAbsolute, href } = paramsResult;
            const imageUpstream = isAbsolute ? await fetchExternalImage(href) : await fetchInternalImage(href, req.originalRequest, res.originalResponse, handleInternalReq);
            return imageOptimizer(imageUpstream, paramsResult, this.nextConfig, {
                isDev: this.renderOpts.dev,
                previousCacheEntry
            });
        }
    }
}
`;

describe("patchNextServer", () => {
  it("should patch getMiddlewareManifest", async () => {
    expect(
      patchCode(
        nextServerGetMiddlewareManifestCode,
        removeMiddlewareManifestRule,
      ),
    ).toMatchInlineSnapshot(`
"class NextNodeServer extends _baseserver.default {
getMiddlewareManifest() {return null;}
}
"
`);
  });

  it("should disable preloading for Next 15", async () => {
    expect(
      patchCode(next15ServerMinimalCode, disablePreloadingRule),
    ).toMatchInlineSnapshot(`
"class NextNodeServer extends _baseserver.default {
constructor(options){
        var _options_conf_experimental_sri, _options_conf_experimental;
        // Initialize super class
        super(options), this.registeredInstrumentation = false, this.cleanupListeners = new _asynccallbackset.AsyncCallbackSet(), this.handleNextImageRequest = async (req, res, parsedUrl)=>{
            if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith('/_next/image')) {
                return false;
            }
            // Ignore if its a middleware request
            if ((0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke')) {
                return false;
            }
            if (this.minimalMode || this.nextConfig.output === 'export' || process.env.NEXT_MINIMAL) {
                res.statusCode = 400;
                res.body('Bad Request').send();
                return true;
            // the \`else\` branch is needed for tree-shaking
            } else {
                const { ImageOptimizerCache } = require('./image-optimizer');
                const imageOptimizerCache = new ImageOptimizerCache({
                    distDir: this.distDir,
                    nextConfig: this.nextConfig
                });
                const { sendResponse, ImageError } = require('./image-optimizer');
                if (!this.imageResponseCache) {
                    throw Object.defineProperty(new Error('invariant image optimizer cache was not initialized'), "__NEXT_ERROR_CODE", {
                        value: "E160",
                        enumerable: false,
                        configurable: true
                    });
                }
                const imagesConfig = this.nextConfig.images;
                if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
                    await this.render404(req, res);
                    return true;
                }
                const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                if ('errorMessage' in paramsResult) {
                    res.statusCode = 400;
                    res.body(paramsResult.errorMessage).send();
                    return true;
                }
                const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                try {
                    var _cacheEntry_value, _cacheEntry_cacheControl;
                    const { getExtension } = require('./serve-static');
                    const cacheEntry = await this.imageResponseCache.get(cacheKey, async ({ previousCacheEntry })=>{
                        const { buffer, contentType, maxAge, upstreamEtag, etag } = await this.imageOptimizer(req, res, paramsResult, previousCacheEntry);
                        return {
                            value: {
                                kind: _responsecache.CachedRouteKind.IMAGE,
                                buffer,
                                etag,
                                extension: getExtension(contentType),
                                upstreamEtag
                            },
                            isFallback: false,
                            cacheControl: {
                                revalidate: maxAge,
                                expire: undefined
                            }
                        };
                    }, {
                        routeKind: _routekind.RouteKind.IMAGE,
                        incrementalCache: imageOptimizerCache,
                        isFallback: false
                    });
                    if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== _responsecache.CachedRouteKind.IMAGE) {
                        throw Object.defineProperty(new Error('invariant did not get entry from image response cache'), "__NEXT_ERROR_CODE", {
                            value: "E518",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, cacheEntry.value.etag, paramsResult.isStatic, cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT', imagesConfig, ((_cacheEntry_cacheControl = cacheEntry.cacheControl) == null ? void 0 : _cacheEntry_cacheControl.revalidate) || 0, Boolean(this.renderOpts.dev));
                    return true;
                } catch (err) {
                    if (err instanceof ImageError) {
                        res.statusCode = err.statusCode;
                        res.body(err.message).send();
                        return true;
                    }
                    throw err;
                }
            }
        }, this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
            let { pathname, query } = parsedUrl;
            if (!pathname) {
                throw Object.defineProperty(new Error('Invariant: pathname is undefined'), "__NEXT_ERROR_CODE", {
                    value: "E409",
                    enumerable: false,
                    configurable: true
                });
            }
            // This is a catch-all route, there should be no fallbacks so mark it as
            // such.
            (0, _requestmeta.addRequestMeta)(req, 'bubbleNoFallback', true);
            try {
                var _this_i18nProvider;
                // next.js core assumes page path without trailing slash
                pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                const options = {
                    i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromRequest(req, pathname)
                };
                const match = await this.matchers.match(pathname, options);
                // If we don't have a match, try to render it anyways.
                if (!match) {
                    await this.render(req, res, pathname, query, parsedUrl, true);
                    return true;
                }
                // Add the match to the request so we don't have to re-run the matcher
                // for the same request.
                (0, _requestmeta.addRequestMeta)(req, 'match', match);
                // TODO-APP: move this to a route handler
                const edgeFunctionsPages = this.getEdgeFunctionsPages();
                for (const edgeFunctionsPage of edgeFunctionsPages){
                    // If the page doesn't match the edge function page, skip it.
                    if (edgeFunctionsPage !== match.definition.page) continue;
                    if (this.nextConfig.output === 'export') {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                    // If we handled the request, we can return early.
                    // For api routes edge runtime
                    try {
                        const handled = await this.runEdgeFunction({
                            req,
                            res,
                            query,
                            params: match.params,
                            page: match.definition.page,
                            match,
                            appPaths: null
                        });
                        if (handled) return true;
                    } catch (apiError) {
                        await this.instrumentationOnRequestError(apiError, req, {
                            routePath: match.definition.page,
                            routerKind: 'Pages Router',
                            routeType: 'route',
                            // Edge runtime does not support ISR
                            revalidateReason: undefined
                        });
                        throw apiError;
                    }
                }
                // If the route was detected as being a Pages API route, then handle
                // it.
                // TODO: move this behavior into a route handler.
                if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                    if (this.nextConfig.output === 'export') {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    const handled = await this.handleApiRequest(req, res, query, match);
                    if (handled) return true;
                }
                await this.render(req, res, pathname, query, parsedUrl, true);
                return true;
            } catch (err) {
                if (err instanceof _baseserver.NoFallbackError) {
                    throw err;
                }
                try {
                    if (this.renderOpts.dev) {
                        const { formatServerError } = require('../lib/format-server-error');
                        formatServerError(err);
                        this.logErrorWithOriginalStack(err);
                    } else {
                        this.logError(err);
                    }
                    res.statusCode = 500;
                    await this.renderError(err, req, res, pathname, query);
                    return true;
                } catch  {}
                throw err;
            }
        }, this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
            const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke');
            if (!isMiddlewareInvoke) {
                return false;
            }
            const handleFinished = ()=>{
                (0, _requestmeta.addRequestMeta)(req, 'middlewareInvoke', true);
                res.body('').send();
                return true;
            };
            const middleware = await this.getMiddleware();
            if (!middleware) {
                return handleFinished();
            }
            const initUrl = (0, _requestmeta.getRequestMeta)(req, 'initURL');
            const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
            const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                nextConfig: this.nextConfig,
                i18nProvider: this.i18nProvider
            });
            parsedUrl.pathname = pathnameInfo.pathname;
            const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || '');
            if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                return handleFinished();
            }
            let result;
            let bubblingResult = false;
            try {
                await this.ensureMiddleware(req.url);
                result = await this.runMiddleware({
                    request: req,
                    response: res,
                    parsedUrl: parsedUrl,
                    parsed: parsed
                });
                if ('response' in result) {
                    if (isMiddlewareInvoke) {
                        bubblingResult = true;
                        throw Object.defineProperty(new _tracer.BubbledError(true, result), "__NEXT_ERROR_CODE", {
                            value: "E394",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                        if (key !== 'content-encoding' && value !== undefined) {
                            res.setHeader(key, value);
                        }
                    }
                    res.statusCode = result.response.status;
                    const { originalResponse } = res;
                    if (result.response.body) {
                        await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                    } else {
                        originalResponse.end();
                    }
                    return true;
                }
            } catch (err) {
                if (bubblingResult) {
                    throw err;
                }
                if ((0, _iserror.default)(err) && err.code === 'ENOENT') {
                    await this.render404(req, res, parsed);
                    return true;
                }
                if (err instanceof _utils.DecodeError) {
                    res.statusCode = 400;
                    await this.renderError(err, req, res, parsed.pathname || '');
                    return true;
                }
                const error = (0, _iserror.getProperError)(err);
                console.error(error);
                res.statusCode = 500;
                await this.renderError(error, req, res, parsed.pathname || '');
                return true;
            }
            return result.finished;
        };
        console.time('Next.js server initialization');
        this.isDev = options.dev ?? false;
        this.sriEnabled = Boolean((_options_conf_experimental = options.conf.experimental) == null ? void 0 : (_options_conf_experimental_sri = _options_conf_experimental.sri) == null ? void 0 : _options_conf_experimental_sri.algorithm);
        /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * \`process.env.__NEXT_OPTIMIZE_CSS\`.
     */ if (this.renderOpts.optimizeCss) {
            process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
        }
        if (this.renderOpts.nextScriptWorkers) {
            process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
        }
        process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || '';
        if (!this.minimalMode) {
            this.imageResponseCache = new _responsecache.default(this.minimalMode);
        }
        const { appDocumentPreloading } = this.nextConfig.experimental;
        const isDefaultEnabled = typeof appDocumentPreloading === 'undefined';
        if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {}
        if (!options.dev && !this.minimalMode && this.nextConfig.experimental.preloadEntriesOnStart) {}
        if (!options.dev) {
            const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
            this.dynamicRoutes = dynamicRoutes.map((r)=>{
                // TODO: can we just re-use the regex from the manifest?
                const regex = (0, _routeregex.getRouteRegex)(r.page);
                const match = (0, _routematcher.getRouteMatcher)(regex);
                return {
                    match,
                    page: r.page,
                    re: regex.re
                };
            });
        }
        // ensure options are set when loadConfig isn't called
        (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
        // Intercept fetch and other testmode apis.
        if (this.serverOptions.experimentalTestProxy) {
            process.env.NEXT_PRIVATE_TEST_PROXY = 'true';
            const { interceptTestApis } = require('next/dist/experimental/testmode/server');
            interceptTestApis();
        }
        this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
        // This is just optimization to fire prepare as soon as possible. It will be
        // properly awaited later. We add the catch here to ensure that it does not
        // cause a unhandled promise rejection. The promise rejection will be
        // handled later on via the \`await\` when the request handler is called.
        if (!options.dev) {
            this.prepare().catch((err)=>{
                console.error('Failed to prepare server', err);
            });
        }
        console.timeEnd('Next.js server initialization');
    }
async runMiddleware(params) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('invariant: runMiddleware should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                value: "E276",
                enumerable: false,
                configurable: true
            });
        }
        // Middleware is skipped for on-demand revalidate requests
        // REST OF THE CODE
    }
async runEdgeFunction(params) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('Middleware is not supported in minimal mode. Please remove the \`NEXT_MINIMAL\` environment variable.'), "__NEXT_ERROR_CODE", {
                value: "E58",
                enumerable: false,
                configurable: true
            });
        }
}
async imageOptimizer(req, res, paramsResult, previousCacheEntry) {
        if (process.env.NEXT_MINIMAL) {
            throw Object.defineProperty(new Error('invariant: imageOptimizer should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                value: "E506",
                enumerable: false,
                configurable: true
            });
        } else {
            const { imageOptimizer, fetchExternalImage, fetchInternalImage } = require('./image-optimizer');
            const handleInternalReq = async (newReq, newRes)=>{
                if (newReq.url === req.url) {
                    throw Object.defineProperty(new Error(\`Invariant attempted to optimize _next/image itself\`), "__NEXT_ERROR_CODE", {
                        value: "E496",
                        enumerable: false,
                        configurable: true
                    });
                }
                if (!this.routerServerHandler) {
                    throw Object.defineProperty(new Error(\`Invariant missing routerServerHandler\`), "__NEXT_ERROR_CODE", {
                        value: "E317",
                        enumerable: false,
                        configurable: true
                    });
                }
                await this.routerServerHandler(newReq, newRes);
                return;
            };
            const { isAbsolute, href } = paramsResult;
            const imageUpstream = isAbsolute ? await fetchExternalImage(href) : await fetchInternalImage(href, req.originalRequest, res.originalResponse, handleInternalReq);
            return imageOptimizer(imageUpstream, paramsResult, this.nextConfig, {
                isDev: this.renderOpts.dev,
                previousCacheEntry
            });
        }
    }
}
"
      `);
  });

  it("should disable preloading for Next 1", async () => {
    const next14ServerMinimalCode = `
class NextNodeServer extends _baseserver.default {
    constructor(options){
        // Initialize super class
        super(options);
        this.handleNextImageRequest = async (req, res, parsedUrl)=>{
            if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith("/_next/image")) {
                return false;
            }
            if (this.minimalMode || this.nextConfig.output === "export" || process.env.NEXT_MINIMAL) {
                res.statusCode = 400;
                res.body("Bad Request").send();
                return true;
            // the \`else\` branch is needed for tree-shaking
            } else {
                const { ImageOptimizerCache } = require("./image-optimizer");
                const imageOptimizerCache = new ImageOptimizerCache({
                    distDir: this.distDir,
                    nextConfig: this.nextConfig
                });
                const { getHash, sendResponse, ImageError } = require("./image-optimizer");
                if (!this.imageResponseCache) {
                    throw new Error("invariant image optimizer cache was not initialized");
                }
                const imagesConfig = this.nextConfig.images;
                if (imagesConfig.loader !== "default" || imagesConfig.unoptimized) {
                    await this.render404(req, res);
                    return true;
                }
                const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                if ("errorMessage" in paramsResult) {
                    res.statusCode = 400;
                    res.body(paramsResult.errorMessage).send();
                    return true;
                }
                const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                try {
                    var _cacheEntry_value;
                    const { getExtension } = require("./serve-static");
                    const cacheEntry = await this.imageResponseCache.get(cacheKey, async ()=>{
                        const { buffer, contentType, maxAge } = await this.imageOptimizer(req, res, paramsResult);
                        const etag = getHash([
                            buffer
                        ]);
                        return {
                            value: {
                                kind: "IMAGE",
                                buffer,
                                etag,
                                extension: getExtension(contentType)
                            },
                            revalidate: maxAge
                        };
                    }, {
                        incrementalCache: imageOptimizerCache
                    });
                    if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== "IMAGE") {
                        throw new Error("invariant did not get entry from image response cache");
                    }
                    sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, paramsResult.isStatic, cacheEntry.isMiss ? "MISS" : cacheEntry.isStale ? "STALE" : "HIT", imagesConfig, cacheEntry.revalidate || 0, Boolean(this.renderOpts.dev));
                    return true;
                } catch (err) {
                    if (err instanceof ImageError) {
                        res.statusCode = err.statusCode;
                        res.body(err.message).send();
                        return true;
                    }
                    throw err;
                }
            }
        };
        this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
            let { pathname, query } = parsedUrl;
            if (!pathname) {
                throw new Error("Invariant: pathname is undefined");
            }
            // This is a catch-all route, there should be no fallbacks so mark it as
            // such.
            query._nextBubbleNoFallback = "1";
            try {
                var _this_i18nProvider;
                // next.js core assumes page path without trailing slash
                pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                const options = {
                    i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromQuery(pathname, query)
                };
                const match = await this.matchers.match(pathname, options);
                // If we don't have a match, try to render it anyways.
                if (!match) {
                    await this.render(req, res, pathname, query, parsedUrl, true);
                    return true;
                }
                // Add the match to the request so we don't have to re-run the matcher
                // for the same request.
                (0, _requestmeta.addRequestMeta)(req, "match", match);
                // TODO-APP: move this to a route handler
                const edgeFunctionsPages = this.getEdgeFunctionsPages();
                for (const edgeFunctionsPage of edgeFunctionsPages){
                    // If the page doesn't match the edge function page, skip it.
                    if (edgeFunctionsPage !== match.definition.page) continue;
                    if (this.nextConfig.output === "export") {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    delete query._nextBubbleNoFallback;
                    delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                    const handled = await this.runEdgeFunction({
                        req,
                        res,
                        query,
                        params: match.params,
                        page: match.definition.page,
                        match,
                        appPaths: null
                    });
                    // If we handled the request, we can return early.
                    if (handled) return true;
                }
                // If the route was detected as being a Pages API route, then handle
                // it.
                // TODO: move this behavior into a route handler.
                if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                    if (this.nextConfig.output === "export") {
                        await this.render404(req, res, parsedUrl);
                        return true;
                    }
                    delete query._nextBubbleNoFallback;
                    const handled = await this.handleApiRequest(req, res, query, match);
                    if (handled) return true;
                }
                await this.render(req, res, pathname, query, parsedUrl, true);
                return true;
            } catch (err) {
                if (err instanceof _baseserver.NoFallbackError) {
                    throw err;
                }
                try {
                    if (this.renderOpts.dev) {
                        const { formatServerError } = require("../lib/format-server-error");
                        formatServerError(err);
                        await this.logErrorWithOriginalStack(err);
                    } else {
                        this.logError(err);
                    }
                    res.statusCode = 500;
                    await this.renderError(err, req, res, pathname, query);
                    return true;
                } catch  {}
                throw err;
            }
        };
        this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
            const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, "middlewareInvoke");
            if (!isMiddlewareInvoke) {
                return false;
            }
            const handleFinished = ()=>{
                (0, _requestmeta.addRequestMeta)(req, "middlewareInvoke", true);
                res.body("").send();
                return true;
            };
            const middleware = this.getMiddleware();
            if (!middleware) {
                return handleFinished();
            }
            const initUrl = (0, _requestmeta.getRequestMeta)(req, "initURL");
            const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
            const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                nextConfig: this.nextConfig,
                i18nProvider: this.i18nProvider
            });
            parsedUrl.pathname = pathnameInfo.pathname;
            const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || "");
            if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                return handleFinished();
            }
            let result;
            let bubblingResult = false;
            try {
                await this.ensureMiddleware(req.url);
                result = await this.runMiddleware({
                    request: req,
                    response: res,
                    parsedUrl: parsedUrl,
                    parsed: parsed
                });
                if ("response" in result) {
                    if (isMiddlewareInvoke) {
                        bubblingResult = true;
                        const err = new Error();
                        err.result = result;
                        err.bubble = true;
                        throw err;
                    }
                    for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                        if (key !== "content-encoding" && value !== undefined) {
                            res.setHeader(key, value);
                        }
                    }
                    res.statusCode = result.response.status;
                    const { originalResponse } = res;
                    if (result.response.body) {
                        await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                    } else {
                        originalResponse.end();
                    }
                    return true;
                }
            } catch (err) {
                if (bubblingResult) {
                    throw err;
                }
                if ((0, _iserror.default)(err) && err.code === "ENOENT") {
                    await this.render404(req, res, parsed);
                    return true;
                }
                if (err instanceof _utils.DecodeError) {
                    res.statusCode = 400;
                    await this.renderError(err, req, res, parsed.pathname || "");
                    return true;
                }
                const error = (0, _iserror.getProperError)(err);
                console.error(error);
                res.statusCode = 500;
                await this.renderError(error, req, res, parsed.pathname || "");
                return true;
            }
            return result.finished;
        };
        this.isDev = options.dev ?? false;
        /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * \`process.env.__NEXT_OPTIMIZE_CSS\`.
     */ if (this.renderOpts.optimizeFonts) {
            process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(this.renderOpts.optimizeFonts);
        }
        if (this.renderOpts.optimizeCss) {
            process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
        }
        if (this.renderOpts.nextScriptWorkers) {
            process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
        }
        process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || "";
        if (!this.minimalMode) {
            this.imageResponseCache = new _responsecache.default(this.minimalMode);
        }
        const { appDocumentPreloading } = this.nextConfig.experimental;
        const isDefaultEnabled = typeof appDocumentPreloading === "undefined";
        if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {
            // pre-warm _document and _app as these will be
            // needed for most requests
            (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page: "/_document",
                isAppPath: false,
                isDev: this.isDev
            }).catch(()=>{});
            (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page: "/_app",
                isAppPath: false,
                isDev: this.isDev
            }).catch(()=>{});
        }
        if (!options.dev && this.nextConfig.experimental.preloadEntriesOnStart) {
            this.unstable_preloadEntries();
        }
        if (!options.dev) {
            const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
            this.dynamicRoutes = dynamicRoutes.map((r)=>{
                // TODO: can we just re-use the regex from the manifest?
                const regex = (0, _routeregex.getRouteRegex)(r.page);
                const match = (0, _routematcher.getRouteMatcher)(regex);
                return {
                    match,
                    page: r.page,
                    re: regex.re
                };
            });
        }
        // ensure options are set when loadConfig isn't called
        (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
        // Intercept fetch and other testmode apis.
        if (this.serverOptions.experimentalTestProxy) {
            process.env.NEXT_PRIVATE_TEST_PROXY = "true";
            const { interceptTestApis } = require("next/dist/experimental/testmode/server");
            interceptTestApis();
        }
        this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
        // This is just optimization to fire prepare as soon as possible. It will be
        // properly awaited later. We add the catch here to ensure that it does not
        // cause a unhandled promise rejection. The promise rejection will be
        // handled later on via the \`await\` when the request handler is called.
        if (!options.dev) {
            this.prepare().catch((err)=>{
                console.error("Failed to prepare server", err);
            });
        }
    }
    async unstable_preloadEntries() {
        const appPathsManifest = this.getAppPathsManifest();
        const pagesManifest = this.getPagesManifest();
        for (const page of Object.keys(pagesManifest || {})){
            await (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page,
                isAppPath: false,
                isDev: this.isDev
            }).catch(()=>{});
        }
        for (const page of Object.keys(appPathsManifest || {})){
            await (0, _loadcomponents.loadComponents)({
                distDir: this.distDir,
                page,
                isAppPath: true,
                isDev: this.isDev
            }).then(async ({ ComponentMod })=>{
                const webpackRequire = ComponentMod.__next_app__.require;
                if (webpackRequire == null ? void 0 : webpackRequire.m) {
                    for (const id of Object.keys(webpackRequire.m)){
                        await webpackRequire(id);
                    }
                }
            }).catch(()=>{});
        }
    }
    async handleUpgrade() {
    // The web server does not support web sockets, it's only used for HMR in
    // development.
    }
  }`;
    expect(
      patchCode(next14ServerMinimalCode, disablePreloadingRule),
    ).toMatchInlineSnapshot(`
      "class NextNodeServer extends _baseserver.default {
          constructor(options){
              // Initialize super class
              super(options);
              this.handleNextImageRequest = async (req, res, parsedUrl)=>{
                  if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith("/_next/image")) {
                      return false;
                  }
                  if (this.minimalMode || this.nextConfig.output === "export" || process.env.NEXT_MINIMAL) {
                      res.statusCode = 400;
                      res.body("Bad Request").send();
                      return true;
                  // the \`else\` branch is needed for tree-shaking
                  } else {
                      const { ImageOptimizerCache } = require("./image-optimizer");
                      const imageOptimizerCache = new ImageOptimizerCache({
                          distDir: this.distDir,
                          nextConfig: this.nextConfig
                      });
                      const { getHash, sendResponse, ImageError } = require("./image-optimizer");
                      if (!this.imageResponseCache) {
                          throw new Error("invariant image optimizer cache was not initialized");
                      }
                      const imagesConfig = this.nextConfig.images;
                      if (imagesConfig.loader !== "default" || imagesConfig.unoptimized) {
                          await this.render404(req, res);
                          return true;
                      }
                      const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                      if ("errorMessage" in paramsResult) {
                          res.statusCode = 400;
                          res.body(paramsResult.errorMessage).send();
                          return true;
                      }
                      const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                      try {
                          var _cacheEntry_value;
                          const { getExtension } = require("./serve-static");
                          const cacheEntry = await this.imageResponseCache.get(cacheKey, async ()=>{
                              const { buffer, contentType, maxAge } = await this.imageOptimizer(req, res, paramsResult);
                              const etag = getHash([
                                  buffer
                              ]);
                              return {
                                  value: {
                                      kind: "IMAGE",
                                      buffer,
                                      etag,
                                      extension: getExtension(contentType)
                                  },
                                  revalidate: maxAge
                              };
                          }, {
                              incrementalCache: imageOptimizerCache
                          });
                          if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== "IMAGE") {
                              throw new Error("invariant did not get entry from image response cache");
                          }
                          sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, paramsResult.isStatic, cacheEntry.isMiss ? "MISS" : cacheEntry.isStale ? "STALE" : "HIT", imagesConfig, cacheEntry.revalidate || 0, Boolean(this.renderOpts.dev));
                          return true;
                      } catch (err) {
                          if (err instanceof ImageError) {
                              res.statusCode = err.statusCode;
                              res.body(err.message).send();
                              return true;
                          }
                          throw err;
                      }
                  }
              };
              this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
                  let { pathname, query } = parsedUrl;
                  if (!pathname) {
                      throw new Error("Invariant: pathname is undefined");
                  }
                  // This is a catch-all route, there should be no fallbacks so mark it as
                  // such.
                  query._nextBubbleNoFallback = "1";
                  try {
                      var _this_i18nProvider;
                      // next.js core assumes page path without trailing slash
                      pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                      const options = {
                          i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromQuery(pathname, query)
                      };
                      const match = await this.matchers.match(pathname, options);
                      // If we don't have a match, try to render it anyways.
                      if (!match) {
                          await this.render(req, res, pathname, query, parsedUrl, true);
                          return true;
                      }
                      // Add the match to the request so we don't have to re-run the matcher
                      // for the same request.
                      (0, _requestmeta.addRequestMeta)(req, "match", match);
                      // TODO-APP: move this to a route handler
                      const edgeFunctionsPages = this.getEdgeFunctionsPages();
                      for (const edgeFunctionsPage of edgeFunctionsPages){
                          // If the page doesn't match the edge function page, skip it.
                          if (edgeFunctionsPage !== match.definition.page) continue;
                          if (this.nextConfig.output === "export") {
                              await this.render404(req, res, parsedUrl);
                              return true;
                          }
                          delete query._nextBubbleNoFallback;
                          delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                          const handled = await this.runEdgeFunction({
                              req,
                              res,
                              query,
                              params: match.params,
                              page: match.definition.page,
                              match,
                              appPaths: null
                          });
                          // If we handled the request, we can return early.
                          if (handled) return true;
                      }
                      // If the route was detected as being a Pages API route, then handle
                      // it.
                      // TODO: move this behavior into a route handler.
                      if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                          if (this.nextConfig.output === "export") {
                              await this.render404(req, res, parsedUrl);
                              return true;
                          }
                          delete query._nextBubbleNoFallback;
                          const handled = await this.handleApiRequest(req, res, query, match);
                          if (handled) return true;
                      }
                      await this.render(req, res, pathname, query, parsedUrl, true);
                      return true;
                  } catch (err) {
                      if (err instanceof _baseserver.NoFallbackError) {
                          throw err;
                      }
                      try {
                          if (this.renderOpts.dev) {
                              const { formatServerError } = require("../lib/format-server-error");
                              formatServerError(err);
                              await this.logErrorWithOriginalStack(err);
                          } else {
                              this.logError(err);
                          }
                          res.statusCode = 500;
                          await this.renderError(err, req, res, pathname, query);
                          return true;
                      } catch  {}
                      throw err;
                  }
              };
              this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
                  const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, "middlewareInvoke");
                  if (!isMiddlewareInvoke) {
                      return false;
                  }
                  const handleFinished = ()=>{
                      (0, _requestmeta.addRequestMeta)(req, "middlewareInvoke", true);
                      res.body("").send();
                      return true;
                  };
                  const middleware = this.getMiddleware();
                  if (!middleware) {
                      return handleFinished();
                  }
                  const initUrl = (0, _requestmeta.getRequestMeta)(req, "initURL");
                  const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
                  const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                      nextConfig: this.nextConfig,
                      i18nProvider: this.i18nProvider
                  });
                  parsedUrl.pathname = pathnameInfo.pathname;
                  const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || "");
                  if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                      return handleFinished();
                  }
                  let result;
                  let bubblingResult = false;
                  try {
                      await this.ensureMiddleware(req.url);
                      result = await this.runMiddleware({
                          request: req,
                          response: res,
                          parsedUrl: parsedUrl,
                          parsed: parsed
                      });
                      if ("response" in result) {
                          if (isMiddlewareInvoke) {
                              bubblingResult = true;
                              const err = new Error();
                              err.result = result;
                              err.bubble = true;
                              throw err;
                          }
                          for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                              if (key !== "content-encoding" && value !== undefined) {
                                  res.setHeader(key, value);
                              }
                          }
                          res.statusCode = result.response.status;
                          const { originalResponse } = res;
                          if (result.response.body) {
                              await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                          } else {
                              originalResponse.end();
                          }
                          return true;
                      }
                  } catch (err) {
                      if (bubblingResult) {
                          throw err;
                      }
                      if ((0, _iserror.default)(err) && err.code === "ENOENT") {
                          await this.render404(req, res, parsed);
                          return true;
                      }
                      if (err instanceof _utils.DecodeError) {
                          res.statusCode = 400;
                          await this.renderError(err, req, res, parsed.pathname || "");
                          return true;
                      }
                      const error = (0, _iserror.getProperError)(err);
                      console.error(error);
                      res.statusCode = 500;
                      await this.renderError(error, req, res, parsed.pathname || "");
                      return true;
                  }
                  return result.finished;
              };
              this.isDev = options.dev ?? false;
              /**
           * This sets environment variable to be used at the time of SSR by head.tsx.
           * Using this from process.env allows targeting SSR by calling
           * \`process.env.__NEXT_OPTIMIZE_CSS\`.
           */ if (this.renderOpts.optimizeFonts) {
                  process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(this.renderOpts.optimizeFonts);
              }
              if (this.renderOpts.optimizeCss) {
                  process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
              }
              if (this.renderOpts.nextScriptWorkers) {
                  process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
              }
              process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || "";
              if (!this.minimalMode) {
                  this.imageResponseCache = new _responsecache.default(this.minimalMode);
              }
              const { appDocumentPreloading } = this.nextConfig.experimental;
              const isDefaultEnabled = typeof appDocumentPreloading === "undefined";
              if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {}
              if (!options.dev && this.nextConfig.experimental.preloadEntriesOnStart) {}
              if (!options.dev) {
                  const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
                  this.dynamicRoutes = dynamicRoutes.map((r)=>{
                      // TODO: can we just re-use the regex from the manifest?
                      const regex = (0, _routeregex.getRouteRegex)(r.page);
                      const match = (0, _routematcher.getRouteMatcher)(regex);
                      return {
                          match,
                          page: r.page,
                          re: regex.re
                      };
                  });
              }
              // ensure options are set when loadConfig isn't called
              (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
              // Intercept fetch and other testmode apis.
              if (this.serverOptions.experimentalTestProxy) {
                  process.env.NEXT_PRIVATE_TEST_PROXY = "true";
                  const { interceptTestApis } = require("next/dist/experimental/testmode/server");
                  interceptTestApis();
              }
              this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
              // This is just optimization to fire prepare as soon as possible. It will be
              // properly awaited later. We add the catch here to ensure that it does not
              // cause a unhandled promise rejection. The promise rejection will be
              // handled later on via the \`await\` when the request handler is called.
              if (!options.dev) {
                  this.prepare().catch((err)=>{
                      console.error("Failed to prepare server", err);
                  });
              }
          }
          async unstable_preloadEntries() {
              const appPathsManifest = this.getAppPathsManifest();
              const pagesManifest = this.getPagesManifest();
              for (const page of Object.keys(pagesManifest || {})){
                  await (0, _loadcomponents.loadComponents)({
                      distDir: this.distDir,
                      page,
                      isAppPath: false,
                      isDev: this.isDev
                  }).catch(()=>{});
              }
              for (const page of Object.keys(appPathsManifest || {})){
                  await (0, _loadcomponents.loadComponents)({
                      distDir: this.distDir,
                      page,
                      isAppPath: true,
                      isDev: this.isDev
                  }).then(async ({ ComponentMod })=>{
                      const webpackRequire = ComponentMod.__next_app__.require;
                      if (webpackRequire == null ? void 0 : webpackRequire.m) {
                          for (const id of Object.keys(webpackRequire.m)){
                              await webpackRequire(id);
                          }
                      }
                  }).catch(()=>{});
              }
          }
          async handleUpgrade() {
          // The web server does not support web sockets, it's only used for HMR in
          // development.
          }
        }"
    `);
  });

  describe("Drop babel dependency", () => {
    test("Drop body", () => {
      expect(
        patchCode(
          next15ServerMinimalCode,
          createEmptyBodyRule("runMiddleware"),
        ),
      ).toMatchInlineSnapshot(`
        "class NextNodeServer extends _baseserver.default {
        constructor(options){
                var _options_conf_experimental_sri, _options_conf_experimental;
                // Initialize super class
                super(options), this.registeredInstrumentation = false, this.cleanupListeners = new _asynccallbackset.AsyncCallbackSet(), this.handleNextImageRequest = async (req, res, parsedUrl)=>{
                    if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith('/_next/image')) {
                        return false;
                    }
                    // Ignore if its a middleware request
                    if ((0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke')) {
                        return false;
                    }
                    if (this.minimalMode || this.nextConfig.output === 'export' || process.env.NEXT_MINIMAL) {
                        res.statusCode = 400;
                        res.body('Bad Request').send();
                        return true;
                    // the \`else\` branch is needed for tree-shaking
                    } else {
                        const { ImageOptimizerCache } = require('./image-optimizer');
                        const imageOptimizerCache = new ImageOptimizerCache({
                            distDir: this.distDir,
                            nextConfig: this.nextConfig
                        });
                        const { sendResponse, ImageError } = require('./image-optimizer');
                        if (!this.imageResponseCache) {
                            throw Object.defineProperty(new Error('invariant image optimizer cache was not initialized'), "__NEXT_ERROR_CODE", {
                                value: "E160",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        const imagesConfig = this.nextConfig.images;
                        if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
                            await this.render404(req, res);
                            return true;
                        }
                        const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                        if ('errorMessage' in paramsResult) {
                            res.statusCode = 400;
                            res.body(paramsResult.errorMessage).send();
                            return true;
                        }
                        const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                        try {
                            var _cacheEntry_value, _cacheEntry_cacheControl;
                            const { getExtension } = require('./serve-static');
                            const cacheEntry = await this.imageResponseCache.get(cacheKey, async ({ previousCacheEntry })=>{
                                const { buffer, contentType, maxAge, upstreamEtag, etag } = await this.imageOptimizer(req, res, paramsResult, previousCacheEntry);
                                return {
                                    value: {
                                        kind: _responsecache.CachedRouteKind.IMAGE,
                                        buffer,
                                        etag,
                                        extension: getExtension(contentType),
                                        upstreamEtag
                                    },
                                    isFallback: false,
                                    cacheControl: {
                                        revalidate: maxAge,
                                        expire: undefined
                                    }
                                };
                            }, {
                                routeKind: _routekind.RouteKind.IMAGE,
                                incrementalCache: imageOptimizerCache,
                                isFallback: false
                            });
                            if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== _responsecache.CachedRouteKind.IMAGE) {
                                throw Object.defineProperty(new Error('invariant did not get entry from image response cache'), "__NEXT_ERROR_CODE", {
                                    value: "E518",
                                    enumerable: false,
                                    configurable: true
                                });
                            }
                            sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, cacheEntry.value.etag, paramsResult.isStatic, cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT', imagesConfig, ((_cacheEntry_cacheControl = cacheEntry.cacheControl) == null ? void 0 : _cacheEntry_cacheControl.revalidate) || 0, Boolean(this.renderOpts.dev));
                            return true;
                        } catch (err) {
                            if (err instanceof ImageError) {
                                res.statusCode = err.statusCode;
                                res.body(err.message).send();
                                return true;
                            }
                            throw err;
                        }
                    }
                }, this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
                    let { pathname, query } = parsedUrl;
                    if (!pathname) {
                        throw Object.defineProperty(new Error('Invariant: pathname is undefined'), "__NEXT_ERROR_CODE", {
                            value: "E409",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    // This is a catch-all route, there should be no fallbacks so mark it as
                    // such.
                    (0, _requestmeta.addRequestMeta)(req, 'bubbleNoFallback', true);
                    try {
                        var _this_i18nProvider;
                        // next.js core assumes page path without trailing slash
                        pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                        const options = {
                            i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromRequest(req, pathname)
                        };
                        const match = await this.matchers.match(pathname, options);
                        // If we don't have a match, try to render it anyways.
                        if (!match) {
                            await this.render(req, res, pathname, query, parsedUrl, true);
                            return true;
                        }
                        // Add the match to the request so we don't have to re-run the matcher
                        // for the same request.
                        (0, _requestmeta.addRequestMeta)(req, 'match', match);
                        // TODO-APP: move this to a route handler
                        const edgeFunctionsPages = this.getEdgeFunctionsPages();
                        for (const edgeFunctionsPage of edgeFunctionsPages){
                            // If the page doesn't match the edge function page, skip it.
                            if (edgeFunctionsPage !== match.definition.page) continue;
                            if (this.nextConfig.output === 'export') {
                                await this.render404(req, res, parsedUrl);
                                return true;
                            }
                            delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                            // If we handled the request, we can return early.
                            // For api routes edge runtime
                            try {
                                const handled = await this.runEdgeFunction({
                                    req,
                                    res,
                                    query,
                                    params: match.params,
                                    page: match.definition.page,
                                    match,
                                    appPaths: null
                                });
                                if (handled) return true;
                            } catch (apiError) {
                                await this.instrumentationOnRequestError(apiError, req, {
                                    routePath: match.definition.page,
                                    routerKind: 'Pages Router',
                                    routeType: 'route',
                                    // Edge runtime does not support ISR
                                    revalidateReason: undefined
                                });
                                throw apiError;
                            }
                        }
                        // If the route was detected as being a Pages API route, then handle
                        // it.
                        // TODO: move this behavior into a route handler.
                        if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                            if (this.nextConfig.output === 'export') {
                                await this.render404(req, res, parsedUrl);
                                return true;
                            }
                            const handled = await this.handleApiRequest(req, res, query, match);
                            if (handled) return true;
                        }
                        await this.render(req, res, pathname, query, parsedUrl, true);
                        return true;
                    } catch (err) {
                        if (err instanceof _baseserver.NoFallbackError) {
                            throw err;
                        }
                        try {
                            if (this.renderOpts.dev) {
                                const { formatServerError } = require('../lib/format-server-error');
                                formatServerError(err);
                                this.logErrorWithOriginalStack(err);
                            } else {
                                this.logError(err);
                            }
                            res.statusCode = 500;
                            await this.renderError(err, req, res, pathname, query);
                            return true;
                        } catch  {}
                        throw err;
                    }
                }, this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
                    const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke');
                    if (!isMiddlewareInvoke) {
                        return false;
                    }
                    const handleFinished = ()=>{
                        (0, _requestmeta.addRequestMeta)(req, 'middlewareInvoke', true);
                        res.body('').send();
                        return true;
                    };
                    const middleware = await this.getMiddleware();
                    if (!middleware) {
                        return handleFinished();
                    }
                    const initUrl = (0, _requestmeta.getRequestMeta)(req, 'initURL');
                    const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
                    const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                        nextConfig: this.nextConfig,
                        i18nProvider: this.i18nProvider
                    });
                    parsedUrl.pathname = pathnameInfo.pathname;
                    const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || '');
                    if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                        return handleFinished();
                    }
                    let result;
                    let bubblingResult = false;
                    try {
                        await this.ensureMiddleware(req.url);
                        result = await this.runMiddleware({
                            request: req,
                            response: res,
                            parsedUrl: parsedUrl,
                            parsed: parsed
                        });
                        if ('response' in result) {
                            if (isMiddlewareInvoke) {
                                bubblingResult = true;
                                throw Object.defineProperty(new _tracer.BubbledError(true, result), "__NEXT_ERROR_CODE", {
                                    value: "E394",
                                    enumerable: false,
                                    configurable: true
                                });
                            }
                            for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                                if (key !== 'content-encoding' && value !== undefined) {
                                    res.setHeader(key, value);
                                }
                            }
                            res.statusCode = result.response.status;
                            const { originalResponse } = res;
                            if (result.response.body) {
                                await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                            } else {
                                originalResponse.end();
                            }
                            return true;
                        }
                    } catch (err) {
                        if (bubblingResult) {
                            throw err;
                        }
                        if ((0, _iserror.default)(err) && err.code === 'ENOENT') {
                            await this.render404(req, res, parsed);
                            return true;
                        }
                        if (err instanceof _utils.DecodeError) {
                            res.statusCode = 400;
                            await this.renderError(err, req, res, parsed.pathname || '');
                            return true;
                        }
                        const error = (0, _iserror.getProperError)(err);
                        console.error(error);
                        res.statusCode = 500;
                        await this.renderError(error, req, res, parsed.pathname || '');
                        return true;
                    }
                    return result.finished;
                };
                console.time('Next.js server initialization');
                this.isDev = options.dev ?? false;
                this.sriEnabled = Boolean((_options_conf_experimental = options.conf.experimental) == null ? void 0 : (_options_conf_experimental_sri = _options_conf_experimental.sri) == null ? void 0 : _options_conf_experimental_sri.algorithm);
                /**
             * This sets environment variable to be used at the time of SSR by head.tsx.
             * Using this from process.env allows targeting SSR by calling
             * \`process.env.__NEXT_OPTIMIZE_CSS\`.
             */ if (this.renderOpts.optimizeCss) {
                    process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
                }
                if (this.renderOpts.nextScriptWorkers) {
                    process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
                }
                process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || '';
                if (!this.minimalMode) {
                    this.imageResponseCache = new _responsecache.default(this.minimalMode);
                }
                const { appDocumentPreloading } = this.nextConfig.experimental;
                const isDefaultEnabled = typeof appDocumentPreloading === 'undefined';
                if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {
                    // pre-warm _document and _app as these will be
                    // needed for most requests
                    (0, _loadcomponents.loadComponents)({
                        distDir: this.distDir,
                        page: '/_document',
                        isAppPath: false,
                        isDev: this.isDev,
                        sriEnabled: this.sriEnabled
                    }).catch(()=>{});
                    (0, _loadcomponents.loadComponents)({
                        distDir: this.distDir,
                        page: '/_app',
                        isAppPath: false,
                        isDev: this.isDev,
                        sriEnabled: this.sriEnabled
                    }).catch(()=>{});
                }
                if (!options.dev && !this.minimalMode && this.nextConfig.experimental.preloadEntriesOnStart) {
                    this.unstable_preloadEntries();
                }
                if (!options.dev) {
                    const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
                    this.dynamicRoutes = dynamicRoutes.map((r)=>{
                        // TODO: can we just re-use the regex from the manifest?
                        const regex = (0, _routeregex.getRouteRegex)(r.page);
                        const match = (0, _routematcher.getRouteMatcher)(regex);
                        return {
                            match,
                            page: r.page,
                            re: regex.re
                        };
                    });
                }
                // ensure options are set when loadConfig isn't called
                (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
                // Intercept fetch and other testmode apis.
                if (this.serverOptions.experimentalTestProxy) {
                    process.env.NEXT_PRIVATE_TEST_PROXY = 'true';
                    const { interceptTestApis } = require('next/dist/experimental/testmode/server');
                    interceptTestApis();
                }
                this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
                // This is just optimization to fire prepare as soon as possible. It will be
                // properly awaited later. We add the catch here to ensure that it does not
                // cause a unhandled promise rejection. The promise rejection will be
                // handled later on via the \`await\` when the request handler is called.
                if (!options.dev) {
                    this.prepare().catch((err)=>{
                        console.error('Failed to prepare server', err);
                    });
                }
                console.timeEnd('Next.js server initialization');
            }
        async runMiddleware(params) {
          throw new Error("runMiddleware should not be called with OpenNext");
        }
        async runEdgeFunction(params) {
                if (process.env.NEXT_MINIMAL) {
                    throw Object.defineProperty(new Error('Middleware is not supported in minimal mode. Please remove the \`NEXT_MINIMAL\` environment variable.'), "__NEXT_ERROR_CODE", {
                        value: "E58",
                        enumerable: false,
                        configurable: true
                    });
                }
        }
        async imageOptimizer(req, res, paramsResult, previousCacheEntry) {
                if (process.env.NEXT_MINIMAL) {
                    throw Object.defineProperty(new Error('invariant: imageOptimizer should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                        value: "E506",
                        enumerable: false,
                        configurable: true
                    });
                } else {
                    const { imageOptimizer, fetchExternalImage, fetchInternalImage } = require('./image-optimizer');
                    const handleInternalReq = async (newReq, newRes)=>{
                        if (newReq.url === req.url) {
                            throw Object.defineProperty(new Error(\`Invariant attempted to optimize _next/image itself\`), "__NEXT_ERROR_CODE", {
                                value: "E496",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        if (!this.routerServerHandler) {
                            throw Object.defineProperty(new Error(\`Invariant missing routerServerHandler\`), "__NEXT_ERROR_CODE", {
                                value: "E317",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        await this.routerServerHandler(newReq, newRes);
                        return;
                    };
                    const { isAbsolute, href } = paramsResult;
                    const imageUpstream = isAbsolute ? await fetchExternalImage(href) : await fetchInternalImage(href, req.originalRequest, res.originalResponse, handleInternalReq);
                    return imageOptimizer(imageUpstream, paramsResult, this.nextConfig, {
                        isDev: this.renderOpts.dev,
                        previousCacheEntry
                    });
                }
            }
        }
        "
      `);

      expect(
        patchCode(
          next15ServerMinimalCode,
          createEmptyBodyRule("runEdgeFunction"),
        ),
      ).toMatchInlineSnapshot(`
        "class NextNodeServer extends _baseserver.default {
        constructor(options){
                var _options_conf_experimental_sri, _options_conf_experimental;
                // Initialize super class
                super(options), this.registeredInstrumentation = false, this.cleanupListeners = new _asynccallbackset.AsyncCallbackSet(), this.handleNextImageRequest = async (req, res, parsedUrl)=>{
                    if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith('/_next/image')) {
                        return false;
                    }
                    // Ignore if its a middleware request
                    if ((0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke')) {
                        return false;
                    }
                    if (this.minimalMode || this.nextConfig.output === 'export' || process.env.NEXT_MINIMAL) {
                        res.statusCode = 400;
                        res.body('Bad Request').send();
                        return true;
                    // the \`else\` branch is needed for tree-shaking
                    } else {
                        const { ImageOptimizerCache } = require('./image-optimizer');
                        const imageOptimizerCache = new ImageOptimizerCache({
                            distDir: this.distDir,
                            nextConfig: this.nextConfig
                        });
                        const { sendResponse, ImageError } = require('./image-optimizer');
                        if (!this.imageResponseCache) {
                            throw Object.defineProperty(new Error('invariant image optimizer cache was not initialized'), "__NEXT_ERROR_CODE", {
                                value: "E160",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        const imagesConfig = this.nextConfig.images;
                        if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
                            await this.render404(req, res);
                            return true;
                        }
                        const paramsResult = ImageOptimizerCache.validateParams(req.originalRequest, parsedUrl.query, this.nextConfig, !!this.renderOpts.dev);
                        if ('errorMessage' in paramsResult) {
                            res.statusCode = 400;
                            res.body(paramsResult.errorMessage).send();
                            return true;
                        }
                        const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult);
                        try {
                            var _cacheEntry_value, _cacheEntry_cacheControl;
                            const { getExtension } = require('./serve-static');
                            const cacheEntry = await this.imageResponseCache.get(cacheKey, async ({ previousCacheEntry })=>{
                                const { buffer, contentType, maxAge, upstreamEtag, etag } = await this.imageOptimizer(req, res, paramsResult, previousCacheEntry);
                                return {
                                    value: {
                                        kind: _responsecache.CachedRouteKind.IMAGE,
                                        buffer,
                                        etag,
                                        extension: getExtension(contentType),
                                        upstreamEtag
                                    },
                                    isFallback: false,
                                    cacheControl: {
                                        revalidate: maxAge,
                                        expire: undefined
                                    }
                                };
                            }, {
                                routeKind: _routekind.RouteKind.IMAGE,
                                incrementalCache: imageOptimizerCache,
                                isFallback: false
                            });
                            if ((cacheEntry == null ? void 0 : (_cacheEntry_value = cacheEntry.value) == null ? void 0 : _cacheEntry_value.kind) !== _responsecache.CachedRouteKind.IMAGE) {
                                throw Object.defineProperty(new Error('invariant did not get entry from image response cache'), "__NEXT_ERROR_CODE", {
                                    value: "E518",
                                    enumerable: false,
                                    configurable: true
                                });
                            }
                            sendResponse(req.originalRequest, res.originalResponse, paramsResult.href, cacheEntry.value.extension, cacheEntry.value.buffer, cacheEntry.value.etag, paramsResult.isStatic, cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT', imagesConfig, ((_cacheEntry_cacheControl = cacheEntry.cacheControl) == null ? void 0 : _cacheEntry_cacheControl.revalidate) || 0, Boolean(this.renderOpts.dev));
                            return true;
                        } catch (err) {
                            if (err instanceof ImageError) {
                                res.statusCode = err.statusCode;
                                res.body(err.message).send();
                                return true;
                            }
                            throw err;
                        }
                    }
                }, this.handleCatchallRenderRequest = async (req, res, parsedUrl)=>{
                    let { pathname, query } = parsedUrl;
                    if (!pathname) {
                        throw Object.defineProperty(new Error('Invariant: pathname is undefined'), "__NEXT_ERROR_CODE", {
                            value: "E409",
                            enumerable: false,
                            configurable: true
                        });
                    }
                    // This is a catch-all route, there should be no fallbacks so mark it as
                    // such.
                    (0, _requestmeta.addRequestMeta)(req, 'bubbleNoFallback', true);
                    try {
                        var _this_i18nProvider;
                        // next.js core assumes page path without trailing slash
                        pathname = (0, _removetrailingslash.removeTrailingSlash)(pathname);
                        const options = {
                            i18n: (_this_i18nProvider = this.i18nProvider) == null ? void 0 : _this_i18nProvider.fromRequest(req, pathname)
                        };
                        const match = await this.matchers.match(pathname, options);
                        // If we don't have a match, try to render it anyways.
                        if (!match) {
                            await this.render(req, res, pathname, query, parsedUrl, true);
                            return true;
                        }
                        // Add the match to the request so we don't have to re-run the matcher
                        // for the same request.
                        (0, _requestmeta.addRequestMeta)(req, 'match', match);
                        // TODO-APP: move this to a route handler
                        const edgeFunctionsPages = this.getEdgeFunctionsPages();
                        for (const edgeFunctionsPage of edgeFunctionsPages){
                            // If the page doesn't match the edge function page, skip it.
                            if (edgeFunctionsPage !== match.definition.page) continue;
                            if (this.nextConfig.output === 'export') {
                                await this.render404(req, res, parsedUrl);
                                return true;
                            }
                            delete query[_approuterheaders.NEXT_RSC_UNION_QUERY];
                            // If we handled the request, we can return early.
                            // For api routes edge runtime
                            try {
                                const handled = await this.runEdgeFunction({
                                    req,
                                    res,
                                    query,
                                    params: match.params,
                                    page: match.definition.page,
                                    match,
                                    appPaths: null
                                });
                                if (handled) return true;
                            } catch (apiError) {
                                await this.instrumentationOnRequestError(apiError, req, {
                                    routePath: match.definition.page,
                                    routerKind: 'Pages Router',
                                    routeType: 'route',
                                    // Edge runtime does not support ISR
                                    revalidateReason: undefined
                                });
                                throw apiError;
                            }
                        }
                        // If the route was detected as being a Pages API route, then handle
                        // it.
                        // TODO: move this behavior into a route handler.
                        if ((0, _pagesapiroutematch.isPagesAPIRouteMatch)(match)) {
                            if (this.nextConfig.output === 'export') {
                                await this.render404(req, res, parsedUrl);
                                return true;
                            }
                            const handled = await this.handleApiRequest(req, res, query, match);
                            if (handled) return true;
                        }
                        await this.render(req, res, pathname, query, parsedUrl, true);
                        return true;
                    } catch (err) {
                        if (err instanceof _baseserver.NoFallbackError) {
                            throw err;
                        }
                        try {
                            if (this.renderOpts.dev) {
                                const { formatServerError } = require('../lib/format-server-error');
                                formatServerError(err);
                                this.logErrorWithOriginalStack(err);
                            } else {
                                this.logError(err);
                            }
                            res.statusCode = 500;
                            await this.renderError(err, req, res, pathname, query);
                            return true;
                        } catch  {}
                        throw err;
                    }
                }, this.handleCatchallMiddlewareRequest = async (req, res, parsed)=>{
                    const isMiddlewareInvoke = (0, _requestmeta.getRequestMeta)(req, 'middlewareInvoke');
                    if (!isMiddlewareInvoke) {
                        return false;
                    }
                    const handleFinished = ()=>{
                        (0, _requestmeta.addRequestMeta)(req, 'middlewareInvoke', true);
                        res.body('').send();
                        return true;
                    };
                    const middleware = await this.getMiddleware();
                    if (!middleware) {
                        return handleFinished();
                    }
                    const initUrl = (0, _requestmeta.getRequestMeta)(req, 'initURL');
                    const parsedUrl = (0, _parseurl.parseUrl)(initUrl);
                    const pathnameInfo = (0, _getnextpathnameinfo.getNextPathnameInfo)(parsedUrl.pathname, {
                        nextConfig: this.nextConfig,
                        i18nProvider: this.i18nProvider
                    });
                    parsedUrl.pathname = pathnameInfo.pathname;
                    const normalizedPathname = (0, _removetrailingslash.removeTrailingSlash)(parsed.pathname || '');
                    if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
                        return handleFinished();
                    }
                    let result;
                    let bubblingResult = false;
                    try {
                        await this.ensureMiddleware(req.url);
                        result = await this.runMiddleware({
                            request: req,
                            response: res,
                            parsedUrl: parsedUrl,
                            parsed: parsed
                        });
                        if ('response' in result) {
                            if (isMiddlewareInvoke) {
                                bubblingResult = true;
                                throw Object.defineProperty(new _tracer.BubbledError(true, result), "__NEXT_ERROR_CODE", {
                                    value: "E394",
                                    enumerable: false,
                                    configurable: true
                                });
                            }
                            for (const [key, value] of Object.entries((0, _utils1.toNodeOutgoingHttpHeaders)(result.response.headers))){
                                if (key !== 'content-encoding' && value !== undefined) {
                                    res.setHeader(key, value);
                                }
                            }
                            res.statusCode = result.response.status;
                            const { originalResponse } = res;
                            if (result.response.body) {
                                await (0, _pipereadable.pipeToNodeResponse)(result.response.body, originalResponse);
                            } else {
                                originalResponse.end();
                            }
                            return true;
                        }
                    } catch (err) {
                        if (bubblingResult) {
                            throw err;
                        }
                        if ((0, _iserror.default)(err) && err.code === 'ENOENT') {
                            await this.render404(req, res, parsed);
                            return true;
                        }
                        if (err instanceof _utils.DecodeError) {
                            res.statusCode = 400;
                            await this.renderError(err, req, res, parsed.pathname || '');
                            return true;
                        }
                        const error = (0, _iserror.getProperError)(err);
                        console.error(error);
                        res.statusCode = 500;
                        await this.renderError(error, req, res, parsed.pathname || '');
                        return true;
                    }
                    return result.finished;
                };
                console.time('Next.js server initialization');
                this.isDev = options.dev ?? false;
                this.sriEnabled = Boolean((_options_conf_experimental = options.conf.experimental) == null ? void 0 : (_options_conf_experimental_sri = _options_conf_experimental.sri) == null ? void 0 : _options_conf_experimental_sri.algorithm);
                /**
             * This sets environment variable to be used at the time of SSR by head.tsx.
             * Using this from process.env allows targeting SSR by calling
             * \`process.env.__NEXT_OPTIMIZE_CSS\`.
             */ if (this.renderOpts.optimizeCss) {
                    process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
                }
                if (this.renderOpts.nextScriptWorkers) {
                    process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true);
                }
                process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || '';
                if (!this.minimalMode) {
                    this.imageResponseCache = new _responsecache.default(this.minimalMode);
                }
                const { appDocumentPreloading } = this.nextConfig.experimental;
                const isDefaultEnabled = typeof appDocumentPreloading === 'undefined';
                if (!options.dev && (appDocumentPreloading === true || !(this.minimalMode && isDefaultEnabled))) {
                    // pre-warm _document and _app as these will be
                    // needed for most requests
                    (0, _loadcomponents.loadComponents)({
                        distDir: this.distDir,
                        page: '/_document',
                        isAppPath: false,
                        isDev: this.isDev,
                        sriEnabled: this.sriEnabled
                    }).catch(()=>{});
                    (0, _loadcomponents.loadComponents)({
                        distDir: this.distDir,
                        page: '/_app',
                        isAppPath: false,
                        isDev: this.isDev,
                        sriEnabled: this.sriEnabled
                    }).catch(()=>{});
                }
                if (!options.dev && !this.minimalMode && this.nextConfig.experimental.preloadEntriesOnStart) {
                    this.unstable_preloadEntries();
                }
                if (!options.dev) {
                    const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {};
                    this.dynamicRoutes = dynamicRoutes.map((r)=>{
                        // TODO: can we just re-use the regex from the manifest?
                        const regex = (0, _routeregex.getRouteRegex)(r.page);
                        const match = (0, _routematcher.getRouteMatcher)(regex);
                        return {
                            match,
                            page: r.page,
                            re: regex.re
                        };
                    });
                }
                // ensure options are set when loadConfig isn't called
                (0, _setuphttpagentenv.setHttpClientAndAgentOptions)(this.nextConfig);
                // Intercept fetch and other testmode apis.
                if (this.serverOptions.experimentalTestProxy) {
                    process.env.NEXT_PRIVATE_TEST_PROXY = 'true';
                    const { interceptTestApis } = require('next/dist/experimental/testmode/server');
                    interceptTestApis();
                }
                this.middlewareManifestPath = (0, _path.join)(this.serverDistDir, _constants.MIDDLEWARE_MANIFEST);
                // This is just optimization to fire prepare as soon as possible. It will be
                // properly awaited later. We add the catch here to ensure that it does not
                // cause a unhandled promise rejection. The promise rejection will be
                // handled later on via the \`await\` when the request handler is called.
                if (!options.dev) {
                    this.prepare().catch((err)=>{
                        console.error('Failed to prepare server', err);
                    });
                }
                console.timeEnd('Next.js server initialization');
            }
        async runMiddleware(params) {
                if (process.env.NEXT_MINIMAL) {
                    throw Object.defineProperty(new Error('invariant: runMiddleware should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                        value: "E276",
                        enumerable: false,
                        configurable: true
                    });
                }
                // Middleware is skipped for on-demand revalidate requests
                // REST OF THE CODE
            }
        async runEdgeFunction(params) {
          throw new Error("runEdgeFunction should not be called with OpenNext");
        }
        async imageOptimizer(req, res, paramsResult, previousCacheEntry) {
                if (process.env.NEXT_MINIMAL) {
                    throw Object.defineProperty(new Error('invariant: imageOptimizer should not be called in minimal mode'), "__NEXT_ERROR_CODE", {
                        value: "E506",
                        enumerable: false,
                        configurable: true
                    });
                } else {
                    const { imageOptimizer, fetchExternalImage, fetchInternalImage } = require('./image-optimizer');
                    const handleInternalReq = async (newReq, newRes)=>{
                        if (newReq.url === req.url) {
                            throw Object.defineProperty(new Error(\`Invariant attempted to optimize _next/image itself\`), "__NEXT_ERROR_CODE", {
                                value: "E496",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        if (!this.routerServerHandler) {
                            throw Object.defineProperty(new Error(\`Invariant missing routerServerHandler\`), "__NEXT_ERROR_CODE", {
                                value: "E317",
                                enumerable: false,
                                configurable: true
                            });
                        }
                        await this.routerServerHandler(newReq, newRes);
                        return;
                    };
                    const { isAbsolute, href } = paramsResult;
                    const imageUpstream = isAbsolute ? await fetchExternalImage(href) : await fetchInternalImage(href, req.originalRequest, res.originalResponse, handleInternalReq);
                    return imageOptimizer(imageUpstream, paramsResult, this.nextConfig, {
                        isDev: this.renderOpts.dev,
                        previousCacheEntry
                    });
                }
            }
        }
        "
      `);
    });

    test("Error Inspect", () => {
      const code = `
// This file should be imported before any others. It sets up the environment
// for later imports to work properly.
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
require("./node-environment-baseline");
require("./node-environment-extensions/error-inspect");
require("./node-environment-extensions/random");
require("./node-environment-extensions/date");
require("./node-environment-extensions/web-crypto");
require("./node-environment-extensions/node-crypto");
//# sourceMappingURL=node-environment.js.map
}`;

      expect(patchCode(code, errorInspectRule)).toMatchInlineSnapshot(`
      "// This file should be imported before any others. It sets up the environment
      // for later imports to work properly.
      "use strict";
      Object.defineProperty(exports, "__esModule", {
          value: true
      });
      require("./node-environment-baseline");
      // Removed by OpenNext
      // require("./node-environment-extensions/error-inspect");
      require("./node-environment-extensions/random");
      require("./node-environment-extensions/date");
      require("./node-environment-extensions/web-crypto");
      require("./node-environment-extensions/node-crypto");
      //# sourceMappingURL=node-environment.js.map
      }"
    `);
    });
  });
});
