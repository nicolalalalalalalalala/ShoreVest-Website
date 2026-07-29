from __future__ import annotations

from pathlib import Path
import re

VERSION = "20260730-approved-cn-copy-1"
COPY_PATH = Path("assets/js/chinese-copy-overrides.js")
GUARD_PATH = Path("assets/js/favicon-guard.js")


def update_copy_overrides() -> None:
    text = COPY_PATH.read_text(encoding="utf-8")

    exact_replacements = {
        "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.）及其相关关联方（统称“ShoreVest”、“我们”或“我们的”）提供的投资者访问门户、受限材料、数据室环境及任何可下载文件的相关事宜。":
        "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.） 及其相关关联方（统称“ShoreVest”、“我们”或“我们的”）提供的投资者访问门户、受限材料、数据室环境及任何可下载文件的相关事宜。",
        "本网站由新岸资本及其相关关联方提供，仅供一般参考。内容为概括性质，可能不完整，可能随时变更且恕不另行通知，亦不旨在为评估新岸资本、任何新岸资本管理的载体或任何投资机会提供完整依据。本网站不面向散户投资者。":
        "本网站由新岸资本及其相关关联方提供，仅供一般参考。内容为概括性质，可能不完整，可能随时变更且恕不另行通知，亦不旨在为评估新岸资本、任何 新岸资本管理的载体或任何投资机会提供完整依据。本网站不面向散户投资者。",
    }

    for old, new in exact_replacements.items():
        if old in text:
            text = text.replace(old, new)
        elif new not in text:
            raise RuntimeError(f"Approved source text not found: {old[:100]}")

    if "function applyApprovedAttributes()" not in text:
        marker = "  function applyApprovedCopy() {\n"
        insertion = '''  function applyApprovedAttributes() {
    var path = location.pathname.toLowerCase();
    if (/(?:^|\\/)cn\\/media(?:\\/|$)|media_cn\\.html$/.test(path)) {
      var mediaHero = document.querySelector('img[src*="media-hero-fii-priority"]');
      if (mediaHero) {
        mediaHero.alt = "新岸资本在 FII Priority 亚洲峰会的专题讨论中发言，面向与会观众";
      }
    }
  }

'''
        if marker not in text:
            raise RuntimeError("applyApprovedCopy insertion point not found")
        text = text.replace(marker, insertion + marker, 1)

        success_old = '      applyDirectReplacements(document.body);\n      document.documentElement.setAttribute("data-sv-cn-copy-corrected", "true");'
        success_new = '      applyDirectReplacements(document.body);\n      applyApprovedAttributes();\n      document.documentElement.setAttribute("data-sv-cn-copy-corrected", "true");'
        if success_old not in text:
            raise RuntimeError("Success-branch insertion point not found")
        text = text.replace(success_old, success_new, 1)

        catch_old = '    }).catch(function () {\n      applyDirectReplacements(document.body);\n    });'
        catch_new = '    }).catch(function () {\n      applyDirectReplacements(document.body);\n      applyApprovedAttributes();\n    });'
        if catch_old not in text:
            raise RuntimeError("Catch-branch insertion point not found")
        text = text.replace(catch_old, catch_new, 1)

        observer_old = '        if (added.nodeType === 1) applyDirectReplacements(added);'
        observer_new = '        if (added.nodeType === 1) {\n          applyDirectReplacements(added);\n          applyApprovedAttributes();\n        }'
        if observer_old not in text:
            raise RuntimeError("Mutation-observer insertion point not found")
        text = text.replace(observer_old, observer_new, 1)

    required = [
        "中国资产支持型私募信贷",
        "机构化经验",
        "市场机遇",
        "覆盖主题",
        "曾获报道媒体",
        "新岸资本团队",
        "访问准入声明",
        "联系我们",
        "我们的工作方式",
        "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.） 及其相关关联方",
        "亦不旨在为评估新岸资本、任何 新岸资本管理的载体或任何投资机会提供完整依据。",
        'mediaHero.alt = "新岸资本在 FII Priority 亚洲峰会的专题讨论中发言，面向与会观众";',
    ]
    missing = [item for item in required if item not in text]
    if missing:
        raise RuntimeError("Approved Chinese mappings missing:\n" + "\n".join(missing))

    COPY_PATH.write_text(text, encoding="utf-8")


def update_loader_version() -> None:
    text = GUARD_PATH.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'var VERSION = "[^"]+";',
        f'var VERSION = "{VERSION}";',
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError("Unable to update favicon-guard version")
    GUARD_PATH.write_text(updated, encoding="utf-8")


def update_chinese_page_cache_keys() -> int:
    changed = 0
    for path in sorted(Path(".").rglob("*.html")):
        if any(part in {".git", "node_modules", "coverage", "playwright-report", "test-results"} for part in path.parts):
            continue
        normalized_path = path.as_posix().lower()
        if "important-information" in normalized_path:
            continue

        text = path.read_text(encoding="utf-8")
        is_chinese = bool(
            re.search(r'<html\b[^>]*lang=["\']zh', text, re.I)
            or normalized_path.startswith("cn/")
            or path.name.lower().endswith("_cn.html")
        )
        if not is_chinese or "favicon-guard.js" not in text:
            continue

        updated = re.sub(
            r'(favicon-guard\.js)\?v=[^"\']+',
            rf'\1?v={VERSION}',
            text,
        )
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1

    return changed


def main() -> None:
    update_copy_overrides()
    update_loader_version()
    changed_pages = update_chinese_page_cache_keys()
    print(f"Approved Chinese copy finalized; cache-busted {changed_pages} Chinese pages.")


if __name__ == "__main__":
    main()
