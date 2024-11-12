---
"@opennextjs/aws": patch
---

add support for next/after
It can also be used to emulate vercel request context (the waitUntil) for lib that may rely on it on serverless env. It needs this env variable EMULATE_VERCEL_REQUEST_CONTEXT to be set to be enabled
