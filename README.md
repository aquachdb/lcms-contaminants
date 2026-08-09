# LC-MS Contaminant Finder

**[Open the tool →](https://aquachdb.github.io/lcms-contaminants/)**

Type the *m/z* of a peak you cannot explain and find out what it is.

A curated, exact-mass-validated compendium of **6,343 LC-MS contaminant and
background ions** covering 2,671 compounds, plus a browser-based tool for
identifying an unknown ion from its mass, charge state and isotope envelope.

Everything runs client-side. **Nothing you type or paste is uploaded**, which
matters when peak lists are confidential.

## What makes this different

**Masses are computed rather than transcribed — for 82% of the table, and the
rest says so.** 5,182 of 6,343 ions carry a molecular formula and adduct, and
their m/z is recalculated from those with the electron mass applied; independent
audit found the maximum disagreement between stored and recomputed values to be
5×10⁻⁵ Da, with none beyond 0.0001 Da. Of the remainder, 1,004 carry the value
their source published and 127 only a nominal integer mass; both are labelled on
every result, and nominal ones display as `~45` rather than as a false exact
mass. Recomputation caught real errors in published tables — including widely
quoted values that omit the electron mass, and a database whose DEHP entry is
actually diisooctyl phthalate.

59% of entries rest on domain knowledge cross-checked against this literature
rather than on a single citable table. Within that, **1,329 rows (21%) are
computed adduct forms** — formate, acetate, chloride and deprotonated ions
derived by rule from a contaminant whose structure is verified, rather than ions
anyone has reported observing. They exist because negative-mode coverage was the
compendium's largest hole: before this the entire table held 28 `[M+HCOO]-`, 17
`[M+CH3COO]-` and 33 `[M+Cl]-` rows, which is not how contaminants actually
appear under a formic-acid or ammonium-acetate mobile phase. Eligibility is
decided by SMARTS substructure rules against a verified structure, not by
formula, and permanent cations, siloxanes and simple esters are deliberately
given nothing. Every computed row is labelled as predicted on its card.

Treat this as a curated screening resource, not a validated reference standard.

**It explains ions rather than just looking them up.** A curated list can only
ever contain what someone thought to write down. Real blanks are dominated by
things no list holds: mobile-phase clusters that depend on your gradient,
metal-corrosion products from the flow path, and multiply charged polymer
envelopes. So the tool works in layers — library, then computed solvent
clusters, then isotope-constrained formula generation, then companion-ion logic.

**Isotopes are read properly.** A+1 is not only ¹³C: ²⁹Si, ³³S, ⁵³Cr and ⁵⁷Fe
all sit at distinct offsets near +1, and at high resolution their *exact* masses
name the element outright. A+2 likewise separates ³⁴S, ³⁷Cl and ⁸¹Br from two
¹³C. And peaks *below* the base peak identify Fe, Cr, Ti, B and Li — the signal
most tools have nowhere to put.

**It says what it does not know.** Isobaric pairs are always shown side by side.
Mass alone cannot separate trifluoroacetate from a sodium formate cluster, and
the tool will not pretend otherwise.

## Using it

| You have | Type |
|---|---|
| a mass | `371` |
| mass and polarity | `371+` or `371-` |
| a charge state too | `371 2+`, `371(3+)`, `371 z=5` |
| a known ion species | `[M+H]+ 371.1012` |
| a name, formula or class | `phthalate`, `C24H38O4`, `siloxane` |

Tolerance follows how precisely you type: `371` searches ±0.5 Da, `371.1012`
searches ±10 ppm. Supplying the **B+1 m/z** is the single most useful extra
input — it fixes the charge state for any *z*, and its exact mass identifies the
element.

The tool assumes an accurate mass by default. If you are on a single quad,
triple quad or ion trap, switch **Instrument resolution** to *unit* under
Refine: matching then uses a fixed ±0.5 Da window however precisely you type,
and isotope offsets stop naming elements — ¹³C and ⁵³Cr are 3 mDa apart, which
such an instrument cannot separate, so the tool reports the ambiguity instead.

There are also tabs for **matching a whole peak list** (homologous series are
grouped, so a blank full of PEG collapses to one line) and for **explaining a
mass difference** between two peaks.

## The data

`data/contaminants.tsv` is the full compendium — one row per ion, with formula,
adduct, polarity, computed *m/z*, contaminant class, provenance, homologous-series
spacing, an MS1-specificity estimate and a flag for whether public MS2 exists.
Column definitions are in `data/SCHEMA.md`. `data/contaminants.json` is the
compact bundle the web app loads.

Sources include peer-reviewed contaminant tables, instrument-vendor background
ion lists, core-facility tables, spectral databases and public code
repositories; each row records its own reference. See ATTRIBUTION.md.

## Contributing — the part that matters most

Existing databases tell you *what* an ion is. Almost none tell you **where it
came from**. Tracing a siloxane to a spent carbon filter on a nitrogen generator
can cost weeks — and that knowledge currently lives only in people's heads.

If you have traced a background ion to its source, please
[report it](../../issues/new?template=contaminant-source.yml). Two fields matter
more than people expect: how you confirmed it, and what you ruled out first.
An *unidentified* ion with a known source is still valuable.

See CONTRIBUTING.md.

## Development

```powershell
python tools/test_mzcalc.py    # exact-mass engine — must report 0 failures
python tools/check_site.py     # real JS parse + cross-file consistency
python -m http.server 8777     # then open http://127.0.0.1:8777
python tools/audit_site.py     # drives headless Chrome against the live page
```

`check_site.py` and `audit_site.py` exist because a build once shipped a page
that loaded forever, caused by one missing parenthesis that no test executed.

## Licence

Data CC BY 4.0, code MIT. See LICENSE. If you use this, please cite it — see
CITATION.cff.

**This gives identification *candidates*, not identifications.** Confirm with
retention time, isotope pattern or MS2.
