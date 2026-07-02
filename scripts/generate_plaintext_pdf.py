#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import textwrap


def escape_pdf_text(s: str) -> str:
    return s.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')


def build_pdf(lines: list[str], title: str = "Document") -> bytes:
    page_w, page_h = 595, 842
    margin_x = 50
    margin_top = 60
    margin_bottom = 60
    font_size = 11
    leading = 14
    usable_h = page_h - margin_top - margin_bottom
    lines_per_page = max(1, usable_h // leading)

    pages: list[list[str]] = []
    for i in range(0, len(lines), lines_per_page):
        pages.append(lines[i:i + lines_per_page])
    if not pages:
        pages = [[""]]

    objects: list[bytes] = []

    def add_obj(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font_obj = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_obj_ids: list[int] = []

    for page_lines in pages:
        text_cmds = ["BT", f"/F1 {font_size} Tf", f"1 0 0 1 {margin_x} {page_h - margin_top} Tm", f"{leading} TL"]
        first = True
        for line in page_lines:
            escaped = escape_pdf_text(line)
            if first:
                text_cmds.append(f"({escaped}) Tj")
                first = False
            else:
                text_cmds.append(f"T* ({escaped}) Tj")
        text_cmds.append("ET")
        stream = "\n".join(text_cmds).encode("utf-8")
        content_obj = add_obj(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream")
        page_obj = add_obj(
            b"<< /Type /Page /Parent PAGES_OBJ 0 R /MediaBox [0 0 "
            + str(page_w).encode("ascii")
            + b" "
            + str(page_h).encode("ascii")
            + b"] /Resources << /Font << /F1 "
            + str(font_obj).encode("ascii")
            + b" 0 R >> >> /Contents "
            + str(content_obj).encode("ascii")
            + b" 0 R >>"
        )
        page_obj_ids.append(page_obj)

    kids = "[" + " ".join(f"{pid} 0 R" for pid in page_obj_ids) + "]"
    pages_obj = add_obj(f"<< /Type /Pages /Kids {kids} /Count {len(page_obj_ids)} >>".encode("ascii"))

    for pid in page_obj_ids:
        objects[pid - 1] = objects[pid - 1].replace(b"PAGES_OBJ", str(pages_obj).encode("ascii"))

    catalog_obj = add_obj(f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("ascii"))
    info_obj = add_obj(f"<< /Title ({escape_pdf_text(title)}) /Producer (simple-python-pdf) >>".encode("utf-8"))

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{i} 0 obj\n".encode("ascii"))
        out.extend(obj)
        out.extend(b"\nendobj\n")

    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objects)+1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))

    out.extend((
        "trailer\n"
        f"<< /Size {len(objects)+1} /Root {catalog_obj} 0 R /Info {info_obj} 0 R >>\n"
        "startxref\n"
        f"{xref_pos}\n"
        "%%EOF\n"
    ).encode("ascii"))
    return bytes(out)


def markdown_to_wrapped_lines(text: str, width: int = 92) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            lines.append("")
            continue
        line = line.replace("**", "").replace("# ", "").replace("## ", "")
        line = line.replace("---", "")
        if line.startswith("[") and "](" in line and line.endswith(")"):
            line = line.split("](")[0].lstrip("[")
        wrapped = textwrap.wrap(line, width=width, break_long_words=False, break_on_hyphens=False)
        lines.extend(wrapped if wrapped else [""])
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--title", default="Document")
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8")
    lines = markdown_to_wrapped_lines(text)
    pdf = build_pdf(lines, title=args.title)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(pdf)


if __name__ == "__main__":
    main()
