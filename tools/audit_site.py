"""Headless-Chrome harness for auditing the contaminant finder before publishing.

Drives the real installed Chrome through Playwright, so what is tested is what a
user gets: real JS execution, real layout, real console errors. A previous
release shipped a blank page because a syntax error was never executed during
testing -- this exists so that cannot recur.

  python audit_site.py                     # run the built-in smoke suite
  python audit_site.py --port 8777         # against a specific server
  python audit_site.py --shots out_dir     # also write PNG screenshots

Importable: `with Harness(port) as h:` gives .page, .errors, .search(), .shot().
"""

import argparse
import os
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Harness:
    def __init__(self, port=8777, shots=None, width=1280, height=900):
        self.url = "http://127.0.0.1:%d/" % port
        self.shots = shots
        self.size = {"width": width, "height": height}
        self.errors = []          # console errors and uncaught exceptions
        self.requests_failed = []

    def __enter__(self):
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(channel="chrome", headless=True)
        self.ctx = self.browser.new_context(viewport=self.size)
        self.page = self.ctx.new_page()
        self.page.on("console", self._console)
        self.page.on("pageerror", lambda e: self.errors.append(("pageerror", str(e))))
        self.page.on("requestfailed",
                     lambda r: self.requests_failed.append(r.url))
        self.page.goto(self.url, wait_until="networkidle", timeout=60000)
        self.page.wait_for_timeout(1500)
        return self

    def _console(self, msg):
        if msg.type in ("error", "warning"):
            self.errors.append((msg.type, msg.text))

    def __exit__(self, *a):
        try:
            self.browser.close()
        finally:
            self._pw.stop()

    # ---- interactions -------------------------------------------------
    def search(self, text, settle=900):
        box = self.page.locator("#q")
        box.fill("")
        box.type(text, delay=12)
        self.page.wait_for_timeout(settle)
        return self.results_text()

    def results_text(self):
        return self.page.inner_text("#results")

    def status(self):
        return self.page.inner_text("#status").strip()

    def n_cards(self):
        return self.page.locator("#cards .card").count()

    def click_tab(self, which):
        self.page.click("#tab-" + which)
        self.page.wait_for_timeout(400)

    def shot(self, name):
        if not self.shots:
            return None
        os.makedirs(self.shots, exist_ok=True)
        p = os.path.join(self.shots, "%s.png" % name)
        self.page.screenshot(path=p, full_page=True)
        return p

    def axe_like_checks(self):
        """Cheap structural accessibility checks that need no external library."""
        return self.page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('img').forEach(el => {
                if (!el.alt) out.push('img without alt: ' + (el.src||'').slice(-40));
            });
            document.querySelectorAll('input,select,textarea').forEach(el => {
                const id = el.id;
                const lab = id && document.querySelector('label[for="'+id+'"]');
                if (!lab && !el.getAttribute('aria-label') && !el.closest('label'))
                    out.push('control without label: ' + (id || el.name || el.tagName));
            });
            document.querySelectorAll('button').forEach(el => {
                if (!el.textContent.trim() && !el.getAttribute('aria-label'))
                    out.push('button without accessible name');
            });
            const h1 = document.querySelectorAll('h1').length;
            if (h1 !== 1) out.push('expected exactly one h1, found ' + h1);
            if (!document.documentElement.lang) out.push('html lang missing');
            return out;
        }""")


CASES = [
    # (query, must appear in results, note)
    ("371+", "iloxane", "D5 siloxane should be the top hit for 371 positive"),
    ("149", "hthalic", "149 should surface the phthalate fragment"),
    ("279.159", "hthalate", "exact mass should give dibutyl/diisobutyl phthalate"),
    ("116.9286-", "hrom", "chromate should be found in negative mode"),
    ("235.9261-", "ferrate|iron|Fe", "iron formate cluster"),
    ("PEG", "PEG|ethylene glycol", "text search should work"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    # Opt-in, as the docstring above has always said. It used to default to
    # site/_audit_shots, which no longer exists -- and since this file is also
    # published as tools/audit_site.py, a directory default would have made a
    # smoke run scatter PNGs into the clean public repo.
    ap.add_argument("--shots", default=None,
                    help="directory to write PNG screenshots into (default: none)")
    args = ap.parse_args()

    import re
    failures = []
    t0 = time.time()
    with Harness(args.port, shots=args.shots) as h:
        print("loaded %s in %.1fs" % (h.url, time.time() - t0))
        print("title: %s" % h.page.title())
        h.shot("01_landing")

        for q, expect, note in CASES:
            txt = h.search(q)
            ok = bool(re.search(expect, txt, re.I))
            print("  %-12s %-6s %s" % (q, "ok" if ok else "FAIL", note))
            if not ok:
                failures.append("query %r did not surface /%s/ -- %s" % (q, expect, note))
                print("      status: %s" % h.status()[:110])
        h.shot("02_results")

        # tabs must not throw
        for tab in ("list", "delta", "find"):
            try:
                h.click_tab(tab)
            except Exception as e:
                failures.append("tab %s failed: %s" % (tab, e))
        h.shot("03_tabs")

        a11y = h.axe_like_checks()
        print("\naccessibility findings: %d" % len(a11y))
        for f in a11y[:12]:
            print("   - %s" % f)

        print("\nconsole errors/warnings: %d" % len(h.errors))
        for kind, text in h.errors[:12]:
            print("   [%s] %s" % (kind, text[:130]))
        if any(k == "pageerror" for k, _ in h.errors):
            failures.append("uncaught JavaScript exception on the page")
        if h.requests_failed:
            failures.append("failed requests: %s" % h.requests_failed[:4])

        if args.shots:
            print("\nscreenshots -> %s" % args.shots)

    print("\n" + ("FAILURES (%d):" % len(failures) if failures else "All harness checks passed."))
    for f in failures:
        print("  - %s" % f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
