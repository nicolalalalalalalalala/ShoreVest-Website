# Repository structure guide

This repository is a static ShoreVest website with a historically flat root. The long-term goal is to make new work predictable without breaking existing production URLs.

## Current structure

```text
.
├── index.html and other root HTML pages
├── assets/
│   ├── brand/        # approved logos and brandmarks
│   ├── css/          # shared site stylesheets
│   ├── data/         # structured site data
│   ├── images/       # organized images
│   ├── img/          # organized legacy images
│   └── js/           # shared scripts
├── css/              # legacy stylesheet location
├── docs/
│   ├── integrations/ # third-party setup notes
│   └── reports/      # historical implementation and QA reports
├── investor-portal/  # investor portal static files
└── scripts/          # maintenance/generation utilities
```

## Placement rules for new files

| File type | Preferred location | Notes |
| --- | --- | --- |
| Public pages | Repository root | Required while the site is served as flat static HTML. |
| Shared CSS | `assets/css/` | Avoid creating additional root-level CSS files. |
| Shared JavaScript | `assets/js/` | Avoid creating additional root-level JS files. |
| Brand assets | `assets/brand/` | Use only approved exports and descriptive filenames. |
| Reusable images | `assets/images/` or `assets/img/` | Prefer descriptive, lowercase names for new assets. |
| Documents and guides | `docs/` | Use subfolders such as `docs/reports/` and `docs/integrations/`. |
| Utility scripts | `scripts/` | Include usage notes in the script header or related docs. |
| Temporary exports | Do not commit | Keep screenshots, local generated PDFs, and scratch files untracked. |

## Migration approach

The root contains many production-linked PDFs, images, and legacy stylesheets. To avoid broken links:

1. Move one asset group at a time.
2. Use `rg` to find every reference before and after the move.
3. Update HTML, CSS, JavaScript, and documentation references in the same commit.
4. Serve the site locally and spot-check affected pages.
5. Keep redirects or duplicate files only when external URLs must remain stable.

## Useful commands

```bash
# Show top-level clutter by extension
find . -maxdepth 1 -type f | sed 's#^./##' | awk 'function ext(name){n=split(name,a,"."); if(n==1)return "[no ext]"; return tolower(a[n])} {c[ext($0)]++} END{for(e in c) print e, c[e]}' | sort

# Find tracked files by folder
git ls-files | awk -F/ '{print $1}' | sort | uniq -c | sort -nr

# Search for references before moving a file
rg -n "filename-or-path"
```
