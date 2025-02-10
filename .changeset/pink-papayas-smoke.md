---
"@opennextjs/aws": minor
---

refactor: `waitUntil` passed around via ALS and `OpenNextHandler` signature has changed

BREAKING CHANGE: `waitUntil` is passed around via ALS to fix #713.

`globalThis.openNextWaitUntil` is no more available, you can access `waitUntil`
on the ALS context: `globalThis.__openNextAls.getStore()`

The `OpenNextHandler` signature has changed: the second parameter was a `StreamCreator`.
It was changed to be of type `OpenNextHandlerOptions` which has both a `streamCreator` key
and a `waitUntil` key.

If you use a custom wrapper, you need to update the call to the handler as follow:

```ts
// before
globalThis.openNextWaitUntil = myWaitUntil;
handler(internalEvent, myStreamCreator);

// after
handler(internalEvent, { streamCreator: myStreamCreator, waitUntil: myWaitUntil });
```
