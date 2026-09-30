"""Build data/snippets.json from the pinned repos in scripts/sources.json.

Run from anywhere: python3 scripts/extract.py
"""

import ast
import hashlib
import io
import json
import keyword
import re
import subprocess
import textwrap
import tokenize
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path.home() / ".cache" / "ducktype-sources"
CAP = 60
MIN_LINES, MAX_LINES, MAX_WIDTH = 5, 30, 100
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "api_route", "websocket"}
SCHEMA_SUFFIXES = ("Schema", "Base", "Create", "Update", "Read")
SYMBOLS = set("_{}[]()<>:=-*@\"'")
PRAGMA = re.compile(r"\s+# (type: ?ignore|noqa|pragma|pyright:).*$")


def checkout(repo, sha, paths):
    dest = CACHE / f"{repo.replace('/', '__')}-{sha[:12]}"
    if not dest.exists():
        run = lambda *args: subprocess.run(["git", "-C", str(dest), *args], check=True)
        dest.mkdir(parents=True)
        run("init", "-q")
        run("remote", "add", "origin", f"https://github.com/{repo}")
        run("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", sha)
        run("sparse-checkout", "set", *paths)
        run("checkout", "-q", "FETCH_HEAD")
    else:
        # fastapi is shared by two sources with different paths
        subprocess.run(["git", "-C", str(dest), "sparse-checkout", "add", *paths], check=True)
    return dest


def python_files(base, paths, skip):
    for p in paths:
        for f in sorted((base / p).rglob("*.py")):
            rel = f.relative_to(base)
            if any(part in skip for part in rel.parts) or f.name.startswith("test_"):
                continue
            # docs_src has plain and Annotated variants of each tutorial; keep the Annotated one
            if f.name.endswith("_py310.py") and f.with_name(f.name.replace("_py310", "_an_py310")).exists():
                continue
            yield f, str(rel)


def candidates(tree):
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            yield node, node.name
            if isinstance(node, ast.ClassDef) and node.end_lineno - node.lineno + 1 > MAX_LINES:
                for sub in node.body:
                    if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        yield sub, f"{node.name}.{sub.name}"


def cut_docstrings(node, lines, offset):
    """Replace every multi-line docstring inside node with its first line. lines[0] is file line offset + 1."""
    docs = []
    for n in ast.walk(node):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body:
            first = n.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                if first.end_lineno > first.lineno:
                    docs.append(first)
    for d in sorted(docs, key=lambda d: d.lineno, reverse=True):
        a, b = d.lineno - 1 - offset, d.end_lineno - offset
        head = lines[a][d.col_offset :]
        opening = re.match(r"[rRuUbB]?('''|\"\"\"|'|\")", head)
        quote = opening.group(1)
        text = [t.strip().removesuffix(quote) for t in [head[opening.end() :]] + lines[a + 1 : b]]
        paragraph = []
        for t in text:
            if t and not t.startswith(("!!!", "[")):  # mkdocs admonitions and links
                paragraph.append(t)
            elif paragraph:
                break
        # first sentence of the first paragraph; a trailing quote char would merge with the closing quotes
        summary = re.split(r"(?<=\.)\s", " ".join(paragraph))[0].rstrip(quote[0]).rstrip()
        if summary:
            lines[a:b] = [" " * d.col_offset + opening.group(0) + summary + quote]


def base_names(cls):
    for b in cls.bases:
        if isinstance(b, ast.Name):
            yield b.id
        elif isinstance(b, ast.Attribute):
            yield b.attr


def category(node, code, path):
    for dec in getattr(node, "decorator_list", []):
        if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and dec.func.attr in ROUTE_METHODS:
            return "route"
    if isinstance(node, ast.ClassDef):
        bases = set(base_names(node))
        table = any(k.arg == "table" for k in node.keywords)
        if bases & {"BaseModel", "BaseSettings"} or ("SQLModel" in bases and not table):
            return "pydantic-model"
        if path.endswith("schemas.py") and any(b.endswith(SCHEMA_SUFFIXES) for b in bases):
            return "pydantic-model"
        if table or any(s in code for s in ("Mapped[", "mapped_column", "Column(")):
            return "db-model"
        return "class"
    if any(s in code for s in ("select(", "session.execute", "session.scalar", ".where(")):
        return "db-query"
    return "function"


def clean(node, file_lines):
    start = min([node.lineno] + [d.lineno for d in node.decorator_list])
    lines = file_lines[start - 1 : node.end_lineno]
    cut_docstrings(node, lines, start - 1)
    # you type code, not prose: drop full-line comments and lint pragmas
    lines = [PRAGMA.sub("", l).rstrip() for l in lines if not l.lstrip().startswith("#")]
    code = textwrap.dedent("\n".join(lines))
    code = re.sub(r"\n{3,}", "\n\n", code).strip("\n")
    code = re.sub(r"([:(\[{,])\n\n", r"\1\n", code)  # blank left where a comment opened a block
    return start, code


def keep(code):
    lines = code.split("\n")
    if "@overload" in lines or code.endswith("..."):  # typing stubs
        return False
    if not (MIN_LINES <= len(lines) <= MAX_LINES) or max(map(len, lines)) > MAX_WIDTH:
        return False
    if not code.isascii() or "\t" in code:
        return False
    shapes = {re.sub(r"\w+", "x", l.strip()) for l in lines}
    if len(shapes) < len(lines) / 2:  # repetitive data like enums of constants
        return False
    try:
        tree = ast.parse(code)
    except SyntaxError:  # the pragma strip can cut a string that contains "# noqa"
        return False
    for n in ast.walk(tree):
        if isinstance(n, (ast.Constant, ast.JoinedStr)) and n.end_lineno - n.lineno + 1 > 3:
            return False
    return True


def normalize(code):
    out = []
    for tok in tokenize.generate_tokens(io.StringIO(code).readline):
        if tok.type == tokenize.NAME and not keyword.iskeyword(tok.string):
            out.append("x")
        elif tok.type == tokenize.STRING:
            out.append("s")
        elif tok.type == tokenize.NUMBER:
            out.append("0")
        elif tok.type in (tokenize.OP, tokenize.NAME):
            out.append(tok.string)
    return " ".join(out)


def density(code):
    chars = [c for c in code if not c.isspace()]
    return sum(c in SYMBOLS for c in chars) / len(chars)


def spread(items, n):
    """n items evenly spaced over the density range."""
    if len(items) <= n:
        return items
    items = sorted(items, key=lambda s: s["_density"])
    return [items[round(i * (len(items) - 1) / (n - 1))] for i in range(n)]


def main():
    sources = json.loads((ROOT / "scripts" / "sources.json").read_text())
    snippets, seen = [], set()
    for src in sources:
        base = checkout(src["repo"], src["sha"], src["paths"])
        for f, rel in python_files(base, src["paths"], src["skip"]):
            text = f.read_text(encoding="utf-8")
            try:
                tree = ast.parse(text)
            except SyntaxError:
                continue
            file_lines = text.split("\n")
            for node, qualname in candidates(tree):
                start, code = clean(node, file_lines)
                if not keep(code):
                    continue
                norm = normalize(code)
                if norm in seen:
                    continue
                seen.add(norm)
                end = node.end_lineno
                snippets.append({
                    "id": hashlib.sha1(f"{src['id']}:{rel}:{qualname}".encode()).hexdigest()[:10],
                    "repo": src["id"],
                    "path": rel,
                    "line": start,
                    "url": f"https://github.com/{src['repo']}/blob/{src['sha']}/{rel}#L{start}-L{end}",
                    "category": category(node, code, rel),
                    "_density": density(code),
                    "code": code,
                })

    groups = defaultdict(list)
    for s in snippets:
        groups[s["repo"], s["category"]].append(s)
    snippets = [s for g in groups.values() for s in spread(g, CAP)]

    ranked = sorted(snippets, key=lambda s: s["_density"])
    for i, s in enumerate(ranked):
        s["difficulty"] = 1 + 3 * i // len(ranked)
    for s in snippets:
        del s["_density"]
    snippets.sort(key=lambda s: (s["repo"], s["path"], s["line"]))

    out = {
        "sources": [{k: src[k] for k in ("id", "repo", "sha", "license")} for src in sources],
        "snippets": [{k: s[k] for k in ("id", "repo", "path", "line", "url", "category", "difficulty", "code")} for s in snippets],
    }
    (ROOT / "data" / "snippets.json").write_text(json.dumps(out, indent=1) + "\n")

    counts = Counter((s["repo"], s["category"]) for s in snippets)
    cats = sorted({c for _, c in counts})
    print(f"{'':18}" + "".join(f"{c:>15}" for c in cats) + f"{'total':>8}")
    for src in sources:
        row = [counts[src["id"], c] for c in cats]
        print(f"{src['id']:18}" + "".join(f"{n:>15}" for n in row) + f"{sum(row):>8}")
    print(f"total {len(snippets)}")


if __name__ == "__main__":
    main()
