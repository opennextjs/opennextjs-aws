---
"@opennextjs/aws": minor
---

perf(OpenNextResponse): do not store the chunks for streamed responses

There is no need to store the chunks for streamed responses.
Not storing the chunks allows saving memory.

BREAKING CHANGE: Note that `OpenNextHandler` will now return an empty body if your wrapper provides a `StreamCreator`
This could break custom converters.
