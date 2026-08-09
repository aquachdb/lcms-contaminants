# Shared TSV schema for LC-MS contaminant tables

This file is the column contract for two different things, and they do not use the same
convention for a missing value:

* the **part files** the compendium is built from -- 18 columns, `NA` for unknown;
* the **published table** `data/contaminants.tsv` -- 42 columns, an **empty field** for unknown.

Part files are what a contributor writes; `contaminants.tsv` is what a reader cites. See
[Published artefacts](#published-artefacts) for the published columns.

## Part files (input)

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

`data/contaminants.tsv` is the merged, m/z-resolved table: **42 columns, 5,964 rows, one row
per unique ion**, tab-separated, UTF-8, no quoting and no escape character (no field contains a
tab, newline or `"`). It is the merged master (`output/contaminants_master_<ts>.tsv` in the
private pipeline -- its 18 part columns plus the computed mass, ladder and provenance columns)
with the MS1 and MS2 evidence layers joined on as the last three columns by
`build_site_data.py`, which writes this file and `contaminants.json` from **one** join so the
two cannot disagree about the same ion.

### Missing values are EMPTY, never `NA`

A part file writes `NA`; this table writes nothing at all. `NA` is a placeholder, not a null:
it is truthy in every language a consumer will use, so `if row["neutral_formula"]:` passes for
a row that has no formula -- an audit of an earlier build reported "rows with no
neutral_formula: 0" for a table where 1,137 rows had none -- and it is one case-fold away from
sodium. `build_tables.clean_field()` empties every such placeholder (`NA`, `N/A`, `null`,
`nan`, `-`, `?`, `unknown`, `TBD`, ...) at the single choke point every output row passes
through, including placeholders hiding as one element of a `;`-separated list.

Two spellings are **real values** and are deliberately kept:

* `mz_basis` = `none` -- one of that column's three documented states.
* `contaminant_name` = `unknown` (8 rows) -- MaConDa and the Waters list publish these ions as
  unidentified. That is what the source says, not a value we failed to fill in.

And `Na` (mixed case) is sodium: it is the `neutral_formula` and `ion_formula` of the elemental
sodium row and is never treated as a placeholder in any column.

### Columns

| # | column | definition |
|---|--------|------------|
| 1 | `mz` | m/z of the ion, 4 dp. Empty for the 30 rows we hold no mass for. Recomputed from formula + adduct when `mz_basis` = `calculated_from_formula` |
| 2 | `polarity` | `pos` or `neg` |
| 3 | `charge` | absolute charge, `1`-`6` |
| 4 | `contaminant_name` | preferred name of the NEUTRAL contaminant this ion is presented as coming from |
| 5 | `adduct` | ion species in the canonical notation (`canonical_adduct()`); empty where no adduct could be assigned |
| 6 | `neutral_formula` | Hill-notation formula of the neutral molecule; empty where none is known |
| 7 | `ion_formula` | Hill-notation composition of the ION -- the merge key. Isotope-labelled adduct terms are bracketed (`C2H3[63Cu]N`) |
| 8 | `neutral_mono_mass` | monoisotopic mass of `neutral_formula`, 6 dp |
| 9 | `category` | one of the controlled vocabulary terms above |
| 10 | `series_name` | homologous/polymer series this compound belongs to, as named by the source (`PEG`, `Triton X`, `Tween 60`) |
| 11 | `n_repeat` | integer n of this oligomer within its series |
| 12 | `repeat_unit_formula` | formula of that series' repeat unit |
| 13 | `ladder_family` | homologous family this ion was assigned to by `ladders.py`, independently of `series_name` (`PEG / ethylene oxide`, `Polydimethylsiloxane`, `Ammonium formate cluster`) |
| 14 | `ladder_repeat_formula` | formula of the family's repeat unit (`C2H4O`, `C2H6OSi`) |
| 15 | `ladder_repeat_mass` | monoisotopic mass of that repeat unit, 4 dp |
| 16 | `ladder_spacing_mz` | the spacing you actually OBSERVE: repeat mass ÷ charge. A PEG `[M+2Na]2+` envelope steps by 22.0131, not 44.0262 |
| 17 | `ladder_prev_mz` | `mz` − `ladder_spacing_mz` -- where the previous member of the series should be |
| 18 | `ladder_next_mz` | `mz` + `ladder_spacing_mz` |
| 19 | `ladder_kmd` | Kendrick mass defect computed against **this family's own** repeat unit, not against CH2, so members of one series share a value |
| 20 | `ladder_note` | the spacing stated in words, including the charge correction |
| 21 | `ladder_family_size` | how many rows of this table belong to that family at the same adduct and polarity |
| 22 | `ladder_prev_member` | the sibling row this table actually contains at `ladder_prev_mz` (±5 mDa), as `name @ m/z`; empty if the table has no such row |
| 23 | `ladder_next_member` | same, at `ladder_next_mz` |
| 24 | `ladder_family_members` | `;`-separated m/z of every sibling in the family |
| 25 | `common_source` | where it comes from, short phrase |
| 26 | `synonyms` | `;`-separated alternate names, including every other name the merge folded in |
| 27 | `rt_behavior` | chromatographic behaviour where known (`void volume`, `elutes late/lipophilic`) |
| 28 | `notes` | diagnostic detail: characteristic fragments, when it appears, how to remove it. Merged rows join their notes with ` \| ` |
| 29 | `mz_basis` | `calculated_from_formula` (4,810) - recomputed here; `reported_only` (1,124) - the source's value, not independently recomputed; `none` (30) - no m/z at all |
| 30 | `confidence` | `high` / `medium` / `low`; the best value in a merged group |
| 31 | `alt_names` | `;`-separated other compound names that give rise to this same ion |
| 32 | `alt_origins` | `;`-separated other reported `common_source` values |
| 33 | `alt_adducts` | `;`-separated other adduct notations seen for it, qualified with the neutral they were written from when that differs (`[M]- of C2H2NaO4`) |
| 34 | `n_records` | how many source records merged into this row |
| 35 | `provenance` | `memory`, `web` or `memory+web` |
| 36 | `source_types` | `;`-separated `source_type` values of the merged records |
| 37 | `references` | ` \|\| `-separated citations, capped at 2000 characters on a separator boundary, never a local path |
| 38 | `record_ids` | `;`-separated `record_id` of every merged source record |
| 39 | `qc_flags` | `;`-separated build flags, see below |
| 40 | `n_ms2_spectra` | how many public MS2 spectra this ion's compound has, see below |
| 41 | `ms2_licence_tier` | whether those spectra may be redistributed, see below |
| 42 | `ms1_specificity_tier` | how far the m/z alone goes towards an identification, see below |

`qc_flags` vocabulary: `no_formula`, `no_adduct`, `no_mz`, `bad_adduct`,
`adduct_loss_exceeds_molecule`, `mz_out_of_lc_ms_range`, `reported_is_nominal`,
`reported_vs_calc_mismatch`, `reported_mz_multivalued`, `computed_adduct_only`,
`computed_adduct_confirmed_by_observation`, `curated_correction_applied`,
`reference_unresolved`, `merged_category_conflict:<other categories>`. Flags are the union
over the merged records, so `no_formula` can appear on a row that does carry a formula: it
means one of the records behind the row had none.

### The MS2 and MS1 evidence columns

`n_ms2_spectra` is a **count of public MS2 spectra**, matched to the compound (any of its
names, including `alt_names`) through a verified InChIKey and aggregated from the harmonised
Spectraverse collection of GNPS, MSnLib, MS-DIAL, MoNA, RIKEN, MassBank, HMDB and FooDB.
937 of 5,964 rows have one.

It is **empty, not `0`**, where no spectra are linked, because the two possible reasons cannot
be told apart from this table and a `0` would assert the wrong one: either no public spectrum
exists, or -- for the majority of this compendium, which is homologous series, ethoxylated
surfactants and oligomer envelopes with no single structure -- there was no structure to search
on in the first place. An empty field says "this table links no MS2 to this ion", which is all
that is actually known.

`ms2_licence_tier` says whether those spectra may be redistributed. It is empty whenever
`n_ms2_spectra` is, and otherwise takes the **best** tier among the ion's spectra:

| value | meaning |
|-------|---------|
| `open` | at least one spectrum comes from a source we can redistribute (GNPS CC0, MSnLib CC BY, MS-DIAL, CC BY/CC0 MassBank) |
| `check` | redistributable only subject to a publication-specific condition; check before reuse |
| `restricted` | non-commercial or share-alike upstream (HMDB, FooDB, RIKEN, NC/SA MassBank); link to it, do not bundle it |

The tier describes **licensing, not spectral quality**, and it is a property of the compound's
spectra, not of this ion's adduct.

`ms1_specificity_tier` says how far the accurate mass **on its own** goes towards an
identification, from the ion's mass defect and how crowded that mass is in known chemistry:

| value | rows | meaning |
|-------|------|---------|
| `high` | 2,357 | the exact mass is distinctive; few known structures sit within a tight window |
| `moderate` | 1,770 | narrows the field but does not settle it |
| `low` | 496 | many candidates share this mass |
| `ms1_alone_insufficient` | 33 | the mass cannot discriminate at all; MS2 or retention time is required |
| *(empty)* | 1,308 | not assessed for this ion |

`data/contaminants.json` is the columnar bundle the
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

Three fields carry the same evidence layers as the TSV's last three columns, and are written
from the same join, so the two files always agree:

| field | TSV column | note |
|-------|-----------|------|
| `ms2n` | `n_ms2_spectra` | integer; **`0`** here where the TSV is empty -- both are falsy, but JSON rows are fixed-length arrays and a number costs less than a null |
| `ms2tier` | `ms2_licence_tier` | same vocabulary |
| `ms1tier` | `ms1_specificity_tier` | same vocabulary |

New fields are appended to the END of `fields`, and the app reads optional columns by name, so a
browser holding an older cached bundle still loads.

`meta.refTable` is an array of distinct reference strings. Reference text is interned because it
is highly repetitive -- 772 distinct strings across ~9,200 row-level occurrences -- so inlining
them would add ~1.9 MB to a bundle every visitor downloads, against ~0.3 MB interned. `syn` and
`rid` are stored as plain strings: their values are near-unique per row, so interning them would
buy little and cost the app an indirection. Rows whose `mz` is empty are omitted from the bundle,
so `rows` is slightly shorter than the TSV.
