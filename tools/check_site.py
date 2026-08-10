"""Diagnostics for the static site: strict JSON validity and JS sanity.

JSON.parse in the browser is stricter than Python's json module -- Python happily
writes NaN/Infinity, which the browser rejects outright and which would leave the
page stuck on its loading message.

This is the "is this repo OK to ship" gate. It needs nothing but this repository,
so it runs in a fresh clone and in CI.

  python tools/check_site.py               # the repo this file ships in
  python tools/check_site.py --root DIR    # any other site root

The site root is a PARAMETER, not a code difference. There used to be two forks
of this file -- one assuming a site/ subdirectory, one assuming a flat repo root
-- and keeping them in step by hand is the failure mode this whole change is
about.
"""

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)


def default_site_root():
    """Where the app lives, if the caller did not say.

    This file is <repo>/tools/check_site.py and the app sits at the repo root --
    the single copy of it, wherever the repo happens to be cloned.
    """
    return PARENT


def main():
    ap = argparse.ArgumentParser(description="Static-site ship gate.")
    ap.add_argument("--root", default=default_site_root(),
                    help="site root holding index.html, app.js and data/ "
                         "(default: %(default)s)")
    args = ap.parse_args()

    site = args.root
    print("site root: %s" % site)
    fails = []

    # ---- data ----
    path = os.path.join(site, "data", "contaminants.json")
    raw = open(path, encoding="utf-8").read()
    print("data file: %.2f MB" % (len(raw) / 1e6))
    for tok in ("NaN", "Infinity"):
        # only where a JSON value can start -- otherwise legitimate chemistry inside
        # strings trips this: 'NaN3' (sodium azide) and 'C2H3O2NaNa' both contain the
        # token. The authoritative check is the strict parse below.
        n = len(re.findall(r'(?<=[\[,:])\s*' + tok + r'(?![A-Za-z0-9_"])', raw))
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
            fails.append("%d rows have the wrong column count (first: row %d)"
                         % (len(bad), bad[0]))
        print("  rows with wrong width: %d" % len(bad))

    # ---- per-compound MS2 files ----
    # These are fetched lazily by the app and inlined into the landing pages, so
    # a malformed one is a broken panel rather than a broken site -- but the
    # license gate below is not cosmetic. A peak list may only ship under a
    # license that permits republication; anything else must be a link. This is
    # the check that keeps that true in a fresh clone, independently of the
    # pipeline that wrote the files.
    MS2_SHIPPABLE = {"CC0", "CC BY", "dl-de/by-2-0"}
    ms2dir = os.path.join(site, "ms2")
    if os.path.isdir(ms2dir):
        names = sorted(f for f in os.listdir(ms2dir) if f.endswith(".json"))
        n_rec = n_peaks = n_ptr = 0
        bad_license, bad_url, unparsed = [], [], []
        manifest = {}
        for fn in names:
            try:
                with open(os.path.join(ms2dir, fn), encoding="utf-8") as fh:
                    doc = json.loads(fh.read(), parse_constant=boom)
            except Exception as exc:                          # noqa: BLE001
                unparsed.append("%s: %s" % (fn, exc))
                continue
            if fn == "index.json":
                manifest = doc.get("files", {})
                continue
            for s in doc.get("spectra", []):
                n_rec += 1
                if s.get("peaks"):
                    n_peaks += 1
                    if s.get("license") not in MS2_SHIPPABLE:
                        bad_license.append("%s/%s (%r)"
                                           % (fn, s.get("acc"), s.get("license")))
                else:
                    n_ptr += 1
                    # a pointer with no link is useless: it is the whole payload
                    if not str(s.get("url", "")).startswith("http"):
                        bad_url.append("%s/%s" % (fn, s.get("acc")))
        print("ms2/: %d files, %d records (%d with peaks, %d pointer-only)"
              % (len(names), n_rec, n_peaks, n_ptr))
        if unparsed:
            print("  unparsed: %d" % len(unparsed))
            fails.append("ms2 files that are not valid JSON: %s" % "; ".join(unparsed[:5]))
        if bad_license:
            print("  PEAKS UNDER A LICENSE THAT DOES NOT PERMIT THEM: %d" % len(bad_license))
            fails.append("ms2 peak lists shipped under a license that does not "
                         "permit republication: %s" % ", ".join(bad_license[:5]))
        if bad_url:
            print("  pointer records with no resolvable URL: %d" % len(bad_url))
            fails.append("ms2 pointer-only records with no URL: %s"
                         % ", ".join(bad_url[:5]))
        stale = sorted(set(manifest) - {n[:-5] for n in names})
        if stale:
            print("  manifest names %d files that do not exist" % len(stale))
            fails.append("ms2/index.json lists missing files: %s" % ", ".join(stale[:5]))
        if not (bad_license or bad_url or unparsed or stale):
            print("  license gate + link check: OK")

    # ---- js ----
    js = open(os.path.join(site, "app.js"), encoding="utf-8").read()
    print("app.js: %d bytes" % len(js))

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
    html = open(os.path.join(site, "index.html"), encoding="utf-8").read()
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
            fails.append("app.js references data fields that do not exist: %s"
                         % ", ".join(unknown))

    print()
    if fails:
        print("PROBLEMS FOUND (%d):" % len(fails))
        for f in fails:
            print("  - %s" % f)
        return 1
    print("All checks passed.")
    return 0


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
                    return "unbalanced %r at offset %d (line %d)" % (
                        c, i, src.count("\n", 0, i) + 1)
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


if __name__ == "__main__":
    sys.exit(main())
