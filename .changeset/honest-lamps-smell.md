---
"@opennextjs/aws": patch
---

perf(OpenNextResponse): do not store the chunks for streamed responses

There is no need to store the chunks for streamed responses.
Not storing the chunks allows saving memory.