---
"@opennextjs/aws": minor
---

perf(OpenNextResponse): do not store the chunks for streamed responses

There is no need to store the chunks for streamed responses.
Not storing the chunks allows saving memory.

Note that `OpenNextHandler` will now return an empty body for streamed responses.
