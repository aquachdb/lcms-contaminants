# LC-MS Contaminant Finder

**[Open the tool →](https://aquachdb.github.io/lcms-contaminants/)**

Type the *m/z* of a peak you cannot explain and find out what it is.

A curated, exact-mass-validated compendium of **4,973 LC-MS contaminant and
background ions** covering 2,612 compounds, plus a browser-based tool for
identifying an unknown ion from its mass, charge state and isotope envelope.

Everything runs client-side. **Nothing you type or paste is uploaded**, which
matters when peak lists are confidential.

## What makes this different

**Every *m/z* is computed, not transcribed.** Each entry carries a molecular
formula and an adduct, and the mass is recalculated from them with the electron
mass applied. This caught real errors in published tables — including widely
quoted values that omit the electron mass, and a database whose DEHP entry is
actually diisooctyl phthalate.

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
