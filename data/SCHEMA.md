# Shared TSV schema for LC-MS contaminant tables

All part files are **tab-separated**, UTF-8, with this exact header row (18 columns, in order).
Use `NA` for unknown. NEVER put a literal tab, newline, or quote character inside a field.

```
contaminant_name	synonyms	category	common_source	series_name	neutral_formula	repeat_unit_formula	n_repeat	adduct	polarity	reported_mz	charge	rt_behavior	notes	source_type	reference	confidence	record_id
```

## Column definitions

| # | column | definition |
|---|--------|------------|
| 1 | contaminant_name | Preferred chemical/common name of the NEUTRAL contaminant (not the ion). e.g. `Bis(2-ethylhexyl) phthalate` |
| 2 | synonyms | `;`-separated alternate names/abbreviations. e.g. `DEHP;dioctyl phthalate;DOP` |
| 3 | category | One of the controlled vocabulary terms below |
| 4 | common_source | Where it comes from, short phrase. e.g. `plastic tubing/vials, gloves` |
| 5 | series_name | Homologous/polymer series name if part of one (`PEG`, `PPG`, `PDMS`, `Triton X`, `Tween 20`, `sodium formate cluster`, `ACN cluster`, `nylon-6 cyclic oligomer`), else `NA` |
| 6 | neutral_formula | Hill-notation molecular formula of the NEUTRAL molecule, no charge, no adduct. e.g. `C24H38O4`. For a polymer oligomer give the formula of THAT oligomer. `NA` only if genuinely unknown |
| 7 | repeat_unit_formula | Formula of the repeat unit for series (`C2H4O` for PEG, `C3H6O` for PPG, `C2H6OSi` for PDMS), else `NA` |
| 8 | n_repeat | Integer n for this oligomer, else `NA` |
| 9 | adduct | Ion species in standard notation: `[M+H]+`, `[M+Na]+`, `[M+K]+`, `[M+NH4]+`, `[M+CH3OH+H]+`, `[2M+Na]+`, `[M-H]-`, `[M+Cl]-`, `[M+HCOO]-`, `[M+CH3COO]-`, `[M+TFA-H]-`, `[M]+` (permanent cation), `[M]-`. For pure cluster ions with no meaningful M, use `[M]+`/`[M]-` and put the whole cluster in neutral_formula minus the charge carrier |
| 10 | polarity | `pos` or `neg` |
| 11 | reported_mz | The m/z **as you recall/read it**, 4 decimals if known, else `NA`. Do NOT compute it by hand -- report what the source says or what you remember. It will be cross-checked against a formula-derived value |
| 12 | charge | `1`, `2`, `3` ... (absolute value) |
| 13 | rt_behavior | Chromatographic behavior if known: `elutes late/lipophilic`, `void volume`, `ubiquitous across gradient`, `NA` |
| 14 | notes | Diagnostic detail: characteristic fragments, spacing of the series (e.g. `44.0262 spacing`), when it appears, how to remove it |
| 15 | source_type | `memory` for recalled entries, `web` for entries taken from a located source |
| 16 | reference | For `web`: full URL, plus DOI/citation if a paper. For `memory`: `internal-knowledge`. **Never a local filesystem path** -- see below |
| 17 | confidence | `high` / `medium` / `low` -- your confidence that this compound+adduct is a genuine, commonly observed LC-MS contaminant AND that the formula is right |
| 18 | record_id | `<partname>-<sequential integer>`, e.g. `M1-001`. Must be unique within your file |

## Controlled vocabulary for `category`

```
polymer_PEG_PPG
polysiloxane
surfactant_nonionic
surfactant_ionic
plasticizer_phthalate
plasticizer_nonphthalate
polymer_additive_antioxidant
polymer_oligomer_other
slip_agent_amide
solvent_impurity
mobile_phase_additive
salt_cluster
ion_pairing_reagent
buffer_biological
sample_prep_reagent
protein_reagent_peptide
personal_care_cosmetic
environmental_ambient
lab_consumable_leachable
biological_matrix_ubiquitous
column_stationary_phase_bleed
tubing_seal_material
antimicrobial_preservative
dye_indicator
misc_background_ion
```

## Rules
- One ROW PER (compound, adduct, polarity). A compound seen as [M+H]+, [M+Na]+ and [M+NH4]+ = 3 rows.
- Only include species that are actually *observed as ions* in ESI/APCI LC-MS. Do not pad the list.
- Prefer precision over volume, but be exhaustive within your assigned scope.
- Do not invent formulas. If unsure of the formula, put `NA` and set confidence `low`.

## Provenance rule: no local filesystem paths in `reference`

A reference must be resolvable **by a reader of the published dataset**. A path such as
`E:\...\manual\canez\ac3c05431_si_001.pdf` is not: it exposes the build machine's layout,
nobody else can open it, and it advertises the publisher-copyrighted PDFs held under
`manual/` that we may not redistribute. Cite the DOI/URL instead.

`build_tables.py` enforces this rather than trusting it. `scrub_local_paths()` removes any
Windows drive path, UNC path or unix system path from `reference` at load time and keeps the
citation that normally follows it after a `|`. If stripping would leave nothing, it falls back
in order to: the public locator for that file (`LOCAL_SOURCE_PUBLIC`), any DOI mentioned in the
same field, then the literal marker
`citation unresolved (local-only source, not redistributable)` -- it never silently blanks a
row. Rows that reach that marker are flagged `reference_unresolved` in `qc_flags` and counted in
the QC report. The scrub is repeated in `clean_field()`, the single choke point every output row
passes through, and the build fails loudly if a path survives into any written file.

Merged references are capped at 2000 characters, but only ever on a ` || ` boundary -- a
mid-string chop once left half a file path in the table. Dropped entries are announced as
`(+N more)`.

## Ion identity: what makes two rows the same row

Part files are written one row per (compound, adduct, polarity), as above. The merged table is
one row per **ION**, and an ion's identity is its **elemental composition, charge and sign** --
`mzcalc.ion_composition(neutral_formula, adduct)`. Nothing else is stable:

* m/z is not. Trifluoroacetate (`C2F3O2-`) and the sodium formate cluster (`C2H2NaO4-`) are both
  112.9856 and are different species. They stay two rows, and the app lists them side by side.
* The (name, adduct-string) pair is not. The sodiated formic acid dimer arrives as
  `[2M+Na-2H]-`, `[M2+Na-2H]-`, `[M2+Na-H2]-` and as the whole cluster baked into the "neutral"
  with adduct `[M]-`, under two different compound names. All four are one ion.

`canonical_adduct()` puts the notation into one house style -- multiplier before M, bare sign at
1+, additions before losses, additions by increasing mass with the charge carrier last, losses
heaviest first, repeats collapsed into a count, standard condensed shorthands (`CH3OH`, `HCOO`,
`CH3COO`, `TFA`). It is a notational normal form only: it never changes what the ion is, so
`[M-H2O-H]-` is NOT rewritten to `[M-H3O]-` even though the two are the same composition.

Merging keeps every alternative rather than discarding it, because "TFA anion from the
mobile-phase additive" and "TFA anion from the sodium trifluoroacetate calibrant" are the same
ion from different sources and that source knowledge is the point of the resource. The primary
record is chosen as a whole (so name, neutral formula and adduct stay a coherent triple) by:
observed before predicted, m/z recomputed before m/z merely reported, higher confidence, more
standard adduct notation, fewer QC flags, longer notes. Confidence takes the best value in the
group; a category disagreement is surfaced as `merged_category_conflict:...` in `qc_flags`.

## Published artefacts

`output/contaminants_master_<ts>.tsv` (shipped as `data/contaminants.tsv`) is the merged,
m/z-resolved table: 39 columns, one row per unique ion. It carries the 18 part columns plus
computed mass/ladder columns and the accumulated provenance columns `n_records`, `provenance`,
`source_types`, `references` (` || `-separated), `record_ids` (`;`-separated) and `qc_flags`.

Four columns hold the ion identity and what the merge preserved:

| column | meaning |
|--------|---------|
| `ion_formula` | Hill-notation composition of the ION -- the merge key. Isotope-labelled adduct terms are bracketed (`C2H3[63Cu]N`) |
| `alt_names` | `;`-separated other compound names that give rise to this same ion |
| `alt_origins` | `;`-separated other reported `common_source` values |
| `alt_adducts` | `;`-separated other adduct notations seen for it, qualified with the neutral they were written from when that differs (`[M]- of C2H2NaO4`) |

`site/data/contaminants.json` (shipped as `data/contaminants.json`) is the columnar bundle the
web app loads. Shape:

```
{ "fields": [...36 short keys...], "rows": [[...], ...], "meta": {...} }
```

Each row is an array positionally matching `fields`. Three fields carry provenance and search
keys, and four carry ion identity:

| field | type | meaning |
|-------|------|---------|
| `refs` | array of integers | indices into `meta.refTable`; `[]` when the row has none |
| `syn`  | string | `;`-separated synonyms, `""` when none |
| `rid`  | string | `;`-separated source `record_id`s |
| `ionf` | string | `ion_formula` -- the ion's elemental composition |
| `altn` | string | `;`-separated other compound names for this ion |
| `alto` | string | `;`-separated other reported origins |
| `alta` | string | `;`-separated other adduct notations |

New fields are appended to the END of `fields`, and the app reads optional columns by name, so a
browser holding an older cached bundle still loads.

`meta.refTable` is an array of distinct reference strings. Reference text is interned because it
is highly repetitive -- 778 distinct strings across ~9,200 row-level occurrences -- so inlining
them would add ~1.9 MB to a bundle every visitor downloads, against ~0.3 MB interned. `syn` and
`rid` are stored as plain strings: their values are near-unique per row, so interning them would
buy little and cost the app an indirection. Rows whose `mz` is empty are omitted from the bundle,
so `rows` is slightly shorter than the TSV.
