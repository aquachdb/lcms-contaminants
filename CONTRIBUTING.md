# Contributing

The most valuable thing you can add here is not a new compound. It is **where a
contaminant came from**.

Existing databases will tell you that *m/z* 371.1012 is decamethylcyclopentasiloxane.
None of them tell you it might be coming from a spent activated-carbon filter on
your nitrogen generator — which is a real case that cost someone weeks of chasing
solvents and LC components first. That knowledge exists, but it lives in people's
heads and in lab notebooks.

## Report a source

Open an issue using **"Report where a contaminant came from"**. It is a structured
form; you only need the *m/z*, the polarity and the source. Two fields matter more
than people expect:

- **How you confirmed it.** Removing the part and watching the ion disappear is
  worth far more than a plausible story.
- **What you ruled out first.** This is what stops the next person repeating your
  search.

An *unidentified* ion with a known source is still a valuable contribution. So is
a confirmed negative: "we suspected X, it wasn't X."

## Report a new contaminant, or a correction

Open an issue with the ion, its polarity and adduct, the molecular formula if you
have it, and how you know. Corrections are especially welcome — this compendium
aggregates published tables, and we have already found real errors in several of
them, including a database whose DEHP entry was actually diisooctyl phthalate.

If you are proposing a new entry, note that **every *m/z* in this project is
computed from a formula and an adduct, never transcribed**. Give the formula and
the adduct and the mass follows; give only a mass and it cannot be validated.

## Contributing code or data directly

Fork, branch, pull request. Before submitting:

```powershell
cd scripts
python test_mzcalc.py        # exact-mass engine, must report 0 failures
python build_tables.py       # rebuild the compendium, check the QC report
python check_site.py         # real JS parse plus cross-file checks
python audit_site.py         # drives headless Chrome against the live page
```

`check_site.py` and `audit_site.py` exist because a release once shipped a page
that loaded forever, caused by a single missing parenthesis that no test executed.
Please do not skip them.

Data contributions go in `parts/` (recalled or curated) or `web/` (extracted from
a source), following the 18-column contract in `SCHEMA.md`. Corrections to existing
rows go in `corrections.tsv` as an auditable overlay with a stated reason, rather
than editing the source part files — that way every change stays reviewable.

## What we cannot accept

- **Copyrighted source documents.** Publisher PDFs and vendor manuals cannot be
  redistributed here. Cite them; derive facts from them; do not commit them.
- **Spectra under non-commercial or share-alike licences**, unless clearly
  segregated and labelled. See `ms2/MS2B_licensing.md` for why this is not
  hypothetical — a widely used aggregate library is labelled CC BY while
  containing a measurable fraction of non-commercial material.

## Licence

Data and community reports: CC BY 4.0. Code: MIT. By contributing you agree your
contribution may be published under those terms with attribution to you.
