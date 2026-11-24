---
"@opennextjs/aws": patch
---

fix: respond with a 500 when the body stream errors before its first chunk

A route returning a stream that errored before its first chunk (e.g. an aborted or timed out `fetch` body) never got a response: streaming wrappers hung until a timeout and non-streaming wrappers returned an empty 200.

An empty, non-cacheable 500 is now returned.
