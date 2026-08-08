# Data licence

The **code** in this repository (`index.html`, `app.js`, `styles.css`, `tools/`)
is MIT licensed — see [LICENSE](LICENSE).

## What is offered under CC BY 4.0, and what is not

Please read this carefully rather than assuming a blanket licence, because a
blanket claim here would not be honest.

**Offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):** the
*compilation* itself — the selection, structuring, normalisation and
de-duplication of entries — together with the annotations computed for this
project: recalculated exact masses, mass defects, predicted isotope envelopes,
homologous-series assignments and spacings, MS1-specificity estimates, and the
curated corrections.

**Not ours to relicense:** the underlying facts and tables were drawn from prior
work, and several sources impose their own terms. Individual entries derive from
peer-reviewed papers under publisher copyright, instrument-vendor documentation
carrying no redistribution grant, and community datasets under GPL and other
licences. **Where an upstream source imposes terms, those terms govern that
content**, and this licence cannot override them.

Every row in `data/contaminants.tsv` records its own source in the `references`
column. Consult it before reusing specific entries, and see
[ATTRIBUTION.md](ATTRIBUTION.md) for the principal sources.

We are explicit about this because this project criticises another widely used
database for labelling an aggregate CC BY while it contained non-commercial and
share-alike material. It would be poor form to repeat the mistake.

If you represent a source and want an entry's attribution changed or removed,
please open an issue.

## You are free to

- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon it for any purpose, including
  commercially

## Under one condition

**Attribution.** Give appropriate credit, link to the licence, and indicate if
changes were made.

Suggested citation:

> Quach A. *LC-MS Contaminant Finder.* https://github.com/aquachdb/lcms-contaminants

See [CITATION.cff](CITATION.cff), which GitHub renders as a "Cite this
repository" button.

## Important: this data aggregates prior work

The compendium derives from published contaminant tables, instrument-vendor
documentation, spectral databases and public code repositories. **Each row
records its own source in its `references` field.** Where you rely on specific
entries, please cite those sources as well — see [ATTRIBUTION.md](ATTRIBUTION.md)
for the principal ones.

**No source documents are redistributed here.** No publisher PDFs, no vendor
manuals, no third-party spectral libraries — only derived facts, each carrying a
citation back to its origin.

## No warranty

This resource gives identification **candidates**, not identifications. Confirm
with retention time, isotope pattern or MS2. The data is provided as-is, without
warranty of any kind.
