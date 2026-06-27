# `@spantail/docs`

The public documentation site for **docs.spantail.com**, built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
(theme: [Nova](https://starlight-theme-nova.pages.dev),
audience split: [starlight-sidebar-topics](https://starlight-sidebar-topics.netlify.app)).

> Status: navigation scaffold. Most pages are `🚧 TBC` placeholders — content is being filled in.

## Run it locally

All commands are run from the repo root (`pnpm` workspace), or pass `--filter docs`.

```bash
pnpm install                      # once, from the repo root
pnpm --filter docs dev            # dev server with hot reload → http://localhost:4321
pnpm --filter docs build          # production build into apps/docs/dist
pnpm --filter docs preview        # serve the production build locally
pnpm --filter docs typecheck      # astro check (content + config types)
```

### Checking search

Pagefind (Starlight's built-in search) only indexes during a **production build**, not in `dev`.
To try search locally:

```bash
pnpm --filter docs build && pnpm --filter docs preview
```

## Authoring content

- Pages live in `src/content/docs/`. English is the root locale; Japanese mirrors it under
  `src/content/docs/ja/` (same paths). Both locales are required.
- Each page is Markdown/MDX with `title` + `description` frontmatter. The page slug comes from its
  file path (e.g. `guides/reports.md` → `/guides/reports/`, `/ja/guides/reports/`).
- The top bar (audiences) and each audience's sidebar are defined in **`astro.config.mjs`** via
  `starlightSidebarTopics([...])`. Adding a page to the nav = create the file **and** add a
  `{ slug: "..." }` entry to the matching topic's `items`.
- The landing page (`src/content/docs/index.mdx` + its `ja` twin) is a Starlight `splash` page with
  the cross-topic links; edit it when topics change.

## Lint / format

`astro.config.mjs` and `src/content.config.ts` are checked by Biome (`pnpm lint`). The
`src/content/` tree (Markdown/MDX) is excluded from Biome in the root `biome.json`.

## Deploy

Static build deployed as Cloudflare Workers assets (`pnpm --filter docs deploy`, see
`wrangler.jsonc`). Binding the `docs.spantail.com` custom domain is a one-time dashboard step.
