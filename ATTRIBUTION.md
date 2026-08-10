# Attribution

This compendium **aggregates and derives from prior published work**. It is
released under CC BY 4.0, and the sources below must be credited when the
corresponding data is reused.

Every row in `data/contaminants.tsv` carries its own `references` field. Where
you rely on a specific entry, cite that source as well as this resource.

**No source documents are redistributed here** — no publisher PDFs, no vendor
manuals, no third-party spectral libraries. Only derived facts, each with a
citation back to its origin.

## Principal sources

Counts are the number of ion records in this compendium citing each source.

- Keller BO, Sui J, Young AB, Whittal RM. **Interferences and contaminants encountered in modern mass spectrometry.** *Analytica Chimica Acta* 2008;627(1):71-81. doi:10.1016/j.aca.2008.04.043  
  *1205 records*
- Waters Corporation. **Background Ion Master List**, Rev. A, 13 April 2010.  
  *567 records*
- Weber RJM, Li E, Bruty J, He S, Viant MR. **MaConDa: a publicly accessible mass spectrometry contaminants database.** *Bioinformatics* 2012;28(21):2856-2857. doi:10.1093/bioinformatics/bts527  
  *539 records*
- Canez CR, Li L. **Investigation of the effects of labware contamination on MS-based analysis.** *Analytical Chemistry* 2024. doi:10.1021/acs.analchem.3c05431  
  *381 records*
- Trotzmuller M, Guo X, Fauland A, Kofeler H, Lankmayr E. **Characteristics and origins of common chemical noise ions in negative ESI LC-MS.** *Journal of Mass Spectrometry* 2011;46(6):553-560. doi:10.1002/jms.1924  
  *130 records*
- Rardin MJ. **Rapid assessment of contaminants and interferences in mass spectrometry data using skyline.** *JASMS* 2018. doi:10.1007/s13361-018-1940-z (HowDirty / Skyline contaminant library)  
  *759 records*
- Stanstrup J. **commonMZ** — community-digitised contaminant mass lists. https://github.com/stanstrup/commonMZ  
  *783 records*
- University of Washington Proteomics Resource. **Common contaminants in mass spectrometry.** (workbook mirrored at massspec.unm.edu)  
  *623 records*
- MassBank Europe. https://massbank.eu/ (per-record licences apply)  
  *85 records*
- Ijames CF, Dutky RC, Fales HM. **Iron carboxylate oxygen-centered-triangle complexes detected during electrospray use of organic acid modifiers.** *JASMS* 1995;6(12):1226-1231.  
  *11 records*
- Tong H, Bell D, Tabei K, Siegel MM. **Automated data massaging, interpretation, and e-mailing modules for high throughput open access mass spectrometry.** *JASMS* 1999;10(11):1174-1187.  
  *41 records*
- NORMAN Suspect List Exchange (Eawag surfactant and blank-feature lists).  
  *431 records*
- New Objective Inc. **Common background ions for electrospray**, TechNote PV-3.  
  *434 records*
- Thermo Fisher Scientific. Notes on troubleshooting LC/MS contamination.  
  *576 records*
- Sigma-Aldrich / MilliporeSigma. LC-MS contaminants documentation.  
  *751 records*

## Scope

3097 of 5003 ion records derive at least partly from a published source; the remainder are domain knowledge cross-checked against the same literature.

## Spectral libraries

MS2 availability flags reference public spectral libraries. **No spectra are
redistributed in this repository.** Several widely used aggregate libraries
carry a mixture of licences — including non-commercial and share-alike records
inside collections labelled CC BY — so spectra should be obtained from their
source under that source's terms.

## Structures and properties

InChIKeys, PubChem CIDs and XLogP values come from PubChem (NCBI), which places
no licence restriction on its own computed content. CIDs were resolved through
PUG REST by full InChIKey, within the documented 5 requests/second limit.

The 2D depictions in `struct/` were drawn here with [RDKit](https://www.rdkit.org/)
(BSD-3-Clause) from the structures resolved above. They are our own rendering of a
public structure, not a copy of anyone's image, and are covered by this
repository's data licence.

## Corrections

If your work is represented here and you would like the attribution changed,
corrected or removed, please open an issue.

## Other cited sources

Additional references recorded in individual rows:

- internal-knowledge *(1930)*
- https://www.rockefeller.edu/proteomics/prc-intranet/common-peptides/ *(168)*
- https://prospector.ucsf.edu/prospector/html/misc/trypsin.htm *(119)*
- https://www.epa.gov/sites/default/files/2019-12/documents/table_of_pfa *(7)*
- https://well-labs.com/docs/EPA%20method%20537_1_2018.PDF *(6)*
- https://acif.ucr.edu/mass-spectrometry/useful-ms-related-information/u *(5)*
- https://pmc.ncbi.nlm.nih.gov/articles/PMC7005802/ *(3)*
- https://www.southampton.ac.uk/~msweb/help/contamination+.html [Mass Sp *(2)*
- https://community.agilent.com/knowledge/lcms-portal/kmp/lcms-articles/ *(1)*
- https://community.agilent.com/technical/lcms/f/forum/5480/how-do-we-ge *(1)*
- http://mass-spec.stanford.edu/assets/SUMS_common_ESI_ions.pdf [Commonl *(1)*
