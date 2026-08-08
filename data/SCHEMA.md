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
| 16 | reference | For `web`: full URL, plus DOI/citation if a paper. For `memory`: `internal-knowledge` |
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
