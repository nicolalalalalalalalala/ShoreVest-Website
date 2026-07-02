# ShoreVest Website

Static website for ShoreVest Partners, including English and Chinese pages, the investor portal, insights, media pages, legal notices, brand assets, and PDF publications.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `*_cn.html`, and other root HTML files | Published static pages served from the site root. Keep these at the root unless links and hosting rules are updated together. |
| `assets/brand/` | Approved ShoreVest logo and brandmark files used by pages. |
| `assets/css/` and `css/` | Site stylesheets. Prefer `assets/css/` for new shared styles and keep legacy root-level CSS in place until references are migrated. |
| `assets/js/` and root `*.js` files | Site JavaScript. Prefer `assets/js/` for new shared scripts and keep legacy root-level scripts in place until references are migrated. |
| `assets/images/`, `assets/img/` | Organized image assets. Place new reusable images here instead of adding more root-level screenshots or exports. |
| `investor-portal/` | Investor portal static entry point and related files. |
| `docs/` | Maintenance notes, setup guides, and historical implementation reports. |
| `scripts/` | Utility scripts for one-off generation or content maintenance tasks. |

For a more detailed organization guide, see [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md).

## Working conventions

1. **Do not move published root assets casually.** Many pages still reference PDFs, images, CSS, and JavaScript from the repository root. Move assets only when you also update every reference and verify the affected pages.
2. **Use organized folders for new work.** New documentation belongs in `docs/`, new utilities in `scripts/`, shared CSS in `assets/css/`, shared JS in `assets/js/`, and reusable images in `assets/images/` or `assets/img/`.
3. **Preserve bilingual parity.** When changing public content, check the matching English and Chinese pages where applicable.
4. **Keep generated clutter out of Git.** Local caches, logs, generated screenshots, and temporary exports should remain untracked; see `.gitignore`.

## Local development

Because the site is static, you can serve it from the repository root with any simple HTTP server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Pre-commit checks

Run these before committing structural changes:

```bash
git status --short
find . -maxdepth 2 -type d | sort
python3 -m compileall scripts
```

If you move files, also search for stale references with `rg` and test the relevant pages in a browser.
