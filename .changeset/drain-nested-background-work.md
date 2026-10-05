---
"@opennextjs/aws": patch
---

Await background work registered while a detached promise runner is draining. This keeps AWS streaming invocations alive for late cache writes registered through `waitUntil`, and handles late rejections before the preceding batch settles.
