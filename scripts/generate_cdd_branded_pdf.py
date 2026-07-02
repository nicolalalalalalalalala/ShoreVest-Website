#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import sys
import urllib.parse


def build_print_url(repo_root: pathlib.Path, template: pathlib.Path, article_json: pathlib.Path) -> str:
    template_abs = (repo_root / template).resolve()
    article_rel = article_json.resolve().relative_to(repo_root)
    encoded = urllib.parse.quote(str(article_rel).replace('\\', '/'))
    return f"{template_abs.as_uri()}?source={encoded}&pdf=1"


def export_pdf_via_playwright(url: str, output_pdf: pathlib.Path) -> None:
    try:
      from playwright.sync_api import sync_playwright
    except ImportError as exc:
      raise RuntimeError(
          "Playwright is required for CDD PDF export. Install with: pip install playwright && playwright install chromium"
      ) from exc

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")
        page.wait_for_function("document.body && document.body.dataset.cddReady === 'true'")
        page.emulate_media(media="print")

        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        page.pdf(
            path=str(output_pdf),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
        browser.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a ShoreVest CDD PDF using the dedicated print template and stylesheet."
    )
    parser.add_argument("input_json", type=pathlib.Path)
    parser.add_argument("output_pdf", type=pathlib.Path)
    parser.add_argument(
        "--template",
        type=pathlib.Path,
        default=pathlib.Path("china-debt-dynamics-print.html"),
        help="Print template path relative to repo root (default: china-debt-dynamics-print.html)",
    )
    parser.add_argument(
        "--repo-root",
        type=pathlib.Path,
        default=pathlib.Path(__file__).resolve().parents[1],
        help="Repository root used to resolve local file URLs",
    )
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    input_json = args.input_json if args.input_json.is_absolute() else (repo_root / args.input_json)

    if not input_json.exists():
        raise FileNotFoundError(f"Article JSON not found: {input_json}")

    try:
        print_url = build_print_url(repo_root, args.template, input_json)
        export_pdf_via_playwright(print_url, args.output_pdf)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"Generated {args.output_pdf}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
