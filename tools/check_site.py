# =====================================================================
# GENERATED FILE -- DO NOT EDIT IN PLACE.
#
# Source of truth : scripts/check_site.py
# Regenerate with : python scripts/sync_published.py
#
# Edits made here are overwritten by the next sync and will fail the
# drift check in `python tools/check_site.py`. Change the source file.
# =====================================================================
# --- generated header ends; everything below is verbatim source ---
"""Diagnostics for the static site: strict JSON validity, JS sanity, and drift.

JSON.parse in the browser is stricter than Python's json module -- Python happily
writes NaN/Infinity, which the browser rejects outright and which would leave the
page stuck on its loading message.

This is the "is this repo OK to ship" gate, so it also verifies that the
generated Python in tools/ still matches its source in the pipeline's scripts/.
That check exists because the published mass engine once drifted eight commits
behind without anyone noticing.

  python tools/check_site.py                 # the repo this file ships in
  python scripts/check_site.py --root DIR    # any site root
  python scripts/check_site.py --no-drift    # skip the tools/ drift check

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

    Published repo: this file is <repo>/tools/check_site.py and the app sits at
    the repo root. Pipeline: this file is <pipeline>/scripts/check_site.py and
    the pipeline holds no copy of the app at all, so fall back to the published
    repo beside it.
    """
    if os.path.exists(os.path.join(PARENT, "index.html")):
        return PARENT
    env = os.environ.get("LCMS_PUBLISHED_ROOT")
    if env:
        return env
    return os.path.join(os.path.dirname(PARENT), "lcms-contaminants")


def find_source_scripts(site_root):
    """The pipeline's scripts/ directory, or None if this box does not have it.

    The published repo is cloned by people who have no access to the private
    pipeline tree, and CI runs without it too, so an absent source tree means
    "cannot check", not "failed".
    """
    cands = []
    env = os.environ.get("LCMS_PIPELINE_ROOT")
    if env:
        cands.append(os.path.join(env, "scripts"))
    # running as the pipeline's own scripts/check_site.py
    cands.append(HERE)
    # published repo sitting beside the pipeline tree
    cands.append(os.path.join(os.path.dirname(os.path.abspath(site_root)),
                              "lcmsContaminants", "scripts"))
    for c in cands:
        if os.path.exists(os.path.join(c, "sync_published.py")):
            return c
    return None


def drift_check(site_root, fails):
    """Verify tools/*.py still match the scripts/ they were generated from."""
    src_dir = find_source_scripts(site_root)
    if src_dir is None:
        print("  tools/ drift: SKIPPED (pipeline source tree not on this machine)")
        return
    # Point the sync module at THIS site root, so --root and the drift check can
    # never disagree about which tools/ directory is under test.
    os.environ["LCMS_PUBLISHED_ROOT"] = os.path.abspath(site_root)
    sys.path.insert(0, src_dir)
    try:
        import sync_published
    except ImportError as e:
        print("  tools/ drift: SKIPPED (%s)" % e)
        return
    bad = []
    for name, state, _src, _want in sync_published.status():
        if state != "ok":
            bad.append("%s (%s)" % (name, state))
    print("  tools/ drift: %s" % ("OK -- %d file(s) match source" % len(sync_published.SYNCED_TOOLS)
                                  if not bad else "DRIFTED"))
    if bad:
        for b in bad:
            print("    %s" % b)
        fails.append("published tools/ have drifted from scripts/: %s "
                     "-- run `python scripts/sync_published.py`" % ", ".join(bad))


def main():
    ap = argparse.ArgumentParser(description="Static-site ship gate.")
    ap.add_argument("--root", default=default_site_root(),
                    help="site root holding index.html, app.js and data/ "
                         "(default: %(default)s)")
    ap.add_argument("--no-drift", action="store_true",
                    help="skip the tools/ generated-copy drift check")
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

    # ---- generated-copy drift ----
    if not args.no_drift:
        drift_check(site, fails)

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
