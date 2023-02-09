// While TS does not offer type declarations, use node-fetch instead (types only)
declare var fetch: typeof import("node-fetch").default
declare var Request: typeof import("node-fetch").Request
declare var Headers: typeof import("node-fetch").Headers
declare type Headers = import("node-fetch").Headers