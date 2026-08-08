"""Diagnostics for the static site: strict JSON validity and JS sanity checks.

JSON.parse in the browser is stricter than Python's json module -- Python happily
writes NaN/Infinity, which the browser rejects outright and which would leave the
page stuck on its loading message.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# in this repository the app lives at the root, not in a site/ subdirectory
SITE = ROOT if os.path.exists(os.path.join(ROOT, "index.html")) else os.path.join(ROOT, "site")

fails = []

# ---- data ----
path = os.path.join(SITE, "data", "contaminants.json")
raw = open(path, encoding="utf-8").read()
print("data file: %.2f MB" % (len(raw) / 1e6))
for tok in ("NaN", "Infinity"):
    n = len(re.findall(r'(?<![A-Za-z"])' + tok + r'(?![A-Za-z"])', raw))
    print("  bare %-9s occurrences: %d" % (tok, n))
    if n:
        fails.append("data contains bare %s, which JSON.parse rejects" % tok)


def boom(x):
    raise ValueError("non-standard JSON constant %r" % x)


try:
    data = json.loads(raw, parse_constant=boom)
    print("  strict JSON parse: OK")
except Exception as e:
    print("  strict JSON parse: FAILED -- %s" % e)
    fails.append("strict JSON parse failed: %s" % e)
    data = None

if data:
    fields, rows = data["fields"], data["rows"]
    print("  fields: %d, rows: %d" % (len(fields), len(rows)))
    bad = [i for i, r in enumerate(rows) if len(r) != len(fields)]
    if bad:
        fails.append("%d rows have the wrong column count (first: row %d)" % (len(bad), bad[0]))
    print("  rows with wrong width: %d" % len(bad))

# ---- js ----
js = open(os.path.join(SITE, "app.js"), encoding="utf-8").read()
print("app.js: %d bytes" % len(js))

# balance check that ignores strings, template literals, comments and regex-ish
def balanced(src):
    depth = {"(": 0, "[": 0, "{": 0}
    pairs = {")": "(", "]": "[", "}": "{"}
    i, n = 0, len(src)
    mode = None      # None | ' | " | ` | // | /* | re
    last_sig = ""    # last significant char, to tell a regex from a division

    def starts_regex():
        # a '/' after an operator, opening bracket or nothing is a regex literal;
        # after an identifier, number or closing bracket it is division
        return last_sig == "" or last_sig in "(,=:[!&|?{};+-*%~^<>"

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if mode is None:
            if c in "'\"`":
                mode = c
            elif c == "/" and nxt == "/":
                mode = "//"
                i += 1
            elif c == "/" and nxt == "*":
                mode = "/*"
                i += 1
            elif c == "/" and starts_regex():
                mode = "re"
            elif c in depth:
                depth[c] += 1
            elif c in pairs:
                depth[pairs[c]] -= 1
                if depth[pairs[c]] < 0:
                    return "unbalanced %r at offset %d (line %d)" % (c, i, src.count("\n", 0, i) + 1)
            if not c.isspace():
                last_sig = c
        elif mode == "re":
            if c == "\\":
                i += 1
            elif c == "[":
                # a '/' inside a character class does not end the literal
                j = src.find("]", i)
                i = j if j > 0 else i
            elif c == "/":
                mode = None
                last_sig = "/"
        elif mode in ("'", '"', "`"):
            if c == "\\":
                i += 1
            elif c == mode:
                mode = None
                last_sig = "x"   # a string is a value, so a following / is division
        elif mode == "//":
            if c == "\n":
                mode = None
        elif mode == "/*":
            if c == "*" and nxt == "/":
                mode = None
                i += 1
        i += 1
    if mode is not None:
        return "file ends inside a %s literal/comment" % mode
    bad = [k for k, v in depth.items() if v != 0]
    return ("unclosed %s" % {k: depth[k] for k in bad}) if bad else None


err = balanced(js)
print("  bracket/quote balance: %s" % (err or "OK"))
if err:
    fails.append("app.js: %s" % err)

# a real parse is the only trustworthy syntax check -- balanced brackets prove
# nothing. esprima is pure Python, so this runs anywhere the rest of this does.
try:
    import esprima
    try:
        esprima.parseScript(js, tolerant=False)
        print("  javascript parse: OK")
    except Exception as e:
        line = getattr(e, "lineNumber", None)
        print("  javascript parse: FAILED -- %s" % e)
        if line:
            for n in range(max(1, line - 2), min(len(js.split("\n")), line + 2) + 1):
                print("      %4d %s%s" % (n, ">> " if n == line else "   ",
                                          js.split("\n")[n - 1][:100]))
        fails.append("app.js does not parse: %s" % e)
except ImportError:
    print("  javascript parse: SKIPPED (pip install esprima for a real check)")

# every getElementById target must exist in the HTML
html = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
ids_in_html = set(re.findall(r'id="([^"]+)"', html))
ids_used = set(re.findall(r"\$\('([^']+)'\)", js))
missing = sorted(ids_used - ids_in_html)
print("  ids referenced by JS: %d, missing from HTML: %d" % (len(ids_used), len(missing)))
if missing:
    print("    MISSING: %s" % ", ".join(missing))
    fails.append("app.js references ids absent from index.html: %s" % ", ".join(missing))

# field names the JS expects must exist in the data
if data:
    used = set(re.findall(r"F\.([A-Za-z_][A-Za-z0-9_]*)", js))
    unknown = sorted(used - set(data["fields"]))
    print("  data fields referenced: %d, unknown: %d" % (len(used), len(unknown)))
    if unknown:
        print("    UNKNOWN: %s" % ", ".join(unknown))
        fails.append("app.js references data fields that do not exist: %s" % ", ".join(unknown))

print()
if fails:
    print("PROBLEMS FOUND (%d):" % len(fails))
    for f in fails:
        print("  - %s" % f)
    sys.exit(1)
print("All checks passed.")
