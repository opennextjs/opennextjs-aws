### Known issues

When defining imports, you must import `types` at the bottom, otherwise esbuild will remove the head comment, eg
`//#override id1` will be omitted from build.

```
//#override imports
import { requestHandler } from "./util.js";

// put the comments last
import type { PluginHandler } from "../next-types.js";
import type { IncomingMessage } from "../request.js";
import type { ServerResponse } from "../response.js";
//#endOverride
```
