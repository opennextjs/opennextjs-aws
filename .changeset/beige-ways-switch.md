---
"@opennextjs/aws": patch
---

chore: Exclude more packages

Added a debug to determine which packages that gets excluded from the final bundle's `node_modules`. Will skip these packages now aswell:

- "typescript"
- "next/dist/compiled/babel"
- "next/dist/compiled/babel-packages"
- "next/dist/compiled/amphtml-validator"