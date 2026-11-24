---
"@opennextjs/aws": patch
---

fix: run the middleware and apply the `next.config` routes for every request of an app using `i18n`

A middleware `matcher` and the `headers()`, `redirects()` and `rewrites()` of `next.config` were skipped for some requests of an app using `i18n`:

- with a `basePath`, for the requests under the basePath;
- with a locale that has uppercase letters (e.g. `en-US`), for the paths starting with that locale (e.g. `/en-US/page`);
- for a middleware `matcher` targeting the default locale only (e.g. `/en/page/:path*` with `locale: false`), when the `NEXT_LOCALE` cookie or the `Accept-Language` header selects another locale (the middleware only).

They now apply as they do with `next start`. Check that they behave as expected: they did not run on OpenNext before.

A middleware without a `matcher` might need to be updated. For the visitors whose `NEXT_LOCALE` cookie or `Accept-Language` header selects a locale other than the default one, `request.nextUrl.pathname` included the basePath or a locale. It is now the path without them (e.g. `/page`), as for the other visitors:

- With a `basePath` (e.g. `/docs`), `request.nextUrl.basePath` was `""` and `pathname` was `/docs/page`. A check on `/docs/page` no longer matches, compare with `/page`. A URL built from `request.nextUrl` (e.g. `clone()`) now keeps the basePath: `/docs/fr/other` instead of `/fr/other`.
- For a URL starting with a locale that has uppercase letters (e.g. `/en-US/page`), `pathname` was `/en-US/page` and `locale` the visitor's locale. They are now `/page` and `en-US`.

With a `basePath`, `request.nextUrl.locale` is now always the default locale for an API route, as it is without a basePath.

A rewrite to an API route now also works for a locale that starts with another locale (e.g. `en-US` and `en`), and the domains of `i18n.domains` are detected when the `Host` header has a port or uppercase letters.
