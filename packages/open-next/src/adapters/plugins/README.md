### Known issues

Do not include `types` in #override and #imports, as esbuild will remove preceeding comments (ie it removes //#override id)when it builds.

Instead, put the `import type` outside like:

```
import type { PluginHandler } from "../next-types.js";
import type { IncomingMessage } from "../request.js";
import type { ServerResponse } from "../response.js";

//#override imports
import { requestHandler } from "./util.js";
//#endOverride
```

The types are removed in the final output anyways.
