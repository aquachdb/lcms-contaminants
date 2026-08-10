# Attribution

This compendium **aggregates and derives from prior published work**. It is
released under CC BY 4.0, and the sources below must be credited when the
corresponding data is reused.

Every row in `data/contaminants.tsv` carries its own `references` field. Where
you rely on a specific entry, cite that source as well as this resource.

**No source documents are redistributed here** — no publisher PDFs and no vendor
manuals. Only derived facts, each with a citation back to its origin, plus the
individually licensed MS2 peak lists described under *Spectral libraries* below.

## Principal sources

Counts are the number of ion records in this compendium citing each source.

- Keller BO, Sui J, Young AB, Whittal RM. **Interferences and contaminants encountered in modern mass spectrometry.** *Analytica Chimica Acta* 2008;627(1):71-81. doi:10.1016/j.aca.2008.04.043  
  *1158 records*
- Waters Corporation. **Background Ion Master List**, Rev. A, 13 April 2010.  
  *542 records*
- Weber RJM, Li E, Bruty J, He S, Viant MR. **MaConDa: a publicly accessible mass spectrometry contaminants database.** *Bioinformatics* 2012;28(21):2856-2857. doi:10.1093/bioinformatics/bts527  
  *539 records*
- Canez CR, Li L. **Investigation of the effects of labware contamination on MS-based analysis.** *Analytical Chemistry* 2024. doi:10.1021/acs.analchem.3c05431  
  *385 records*
- Trotzmuller M, Guo X, Fauland A, Kofeler H, Lankmayr E. **Characteristics and origins of common chemical noise ions in negative ESI LC-MS.** *Journal of Mass Spectrometry* 2011;46(6):553-560. doi:10.1002/jms.1924  
  *132 records*
- Rardin MJ. **Rapid assessment of contaminants and interferences in mass spectrometry data using skyline.** *JASMS* 2018. doi:10.1007/s13361-018-1940-z (HowDirty / Skyline contaminant library)  
  *772 records*
- Stanstrup J. **commonMZ** — community-digitized contaminant mass lists. https://github.com/stanstrup/commonMZ  
  *773 records*
- University of Washington Proteomics Resource. **Common contaminants in mass spectrometry.** (workbook mirrored at massspec.unm.edu)  
  *588 records*
- MassBank Europe. https://massbank.eu/ (per-record licenses apply)  
  *92 records*
- Ijames CF, Dutky RC, Fales HM. **Iron carboxylate oxygen-centered-triangle complexes detected during electrospray use of organic acid modifiers.** *JASMS* 1995;6(12):1226-1231.  
  *7 records*
- Tong H, Bell D, Tabei K, Siegel MM. **Automated data massaging, interpretation, and e-mailing modules for high throughput open access mass spectrometry.** *JASMS* 1999;10(11):1174-1187.  
  *41 records*
- NORMAN Suspect List Exchange (Eawag surfactant and blank-feature lists).  
  *434 records*
- New Objective Inc. **Common background ions for electrospray**, TechNote PV-3.  
  *426 records*
- Thermo Fisher Scientific. Notes on troubleshooting LC/MS contamination.  
  *574 records*
- Sigma-Aldrich / MilliporeSigma. LC-MS contaminants documentation.  
  *752 records*

## Scope

3010 of 5964 ion records derive at least partly from a published source; the remainder are domain knowledge cross-checked against the same literature.

## Spectral libraries

`ms2/<INCHIKEY_SKELETON>.json` lists public MS2 records per compound. Each record
carries **its own license string and a link to the original**; nothing is covered
by a blanket claim.

Peak lists are reproduced **only** where that record's own license permits
republication — `CC0`, `CC BY`, or `dl-de/by-2-0`. Share-alike records are linked
and not copied, because this compendium is CC BY 4.0 and cannot pass a share-alike
obligation on; non-commercial and no-derivatives records are likewise linked only.

The peaks come from the primary libraries, not from an aggregate. Widely used
aggregate libraries mix licenses — non-commercial and share-alike records sit
inside collections labeled CC BY — and publish neither a per-record license nor an
upstream accession, so a spectrum taken from one can be neither licensed nor cited.
Aggregates are used here only to count what exists.

- **MassBank Europe** — peaks reproduced from records whose own `LICENSE` field is
  CC BY, CC0 or dl-de/by-2-0. Cite: Neumann S *et al.* **MassBank: an open and FAIR
  mass spectral data resource.** *Nucleic Acids Research* 2025. doi:10.1093/nar/gkaf1193
- **GNPS** — peaks reproduced from GNPS-contributed libraries, which are CC0 1.0.
  Third-party libraries imported into GNPS retain their upstream terms and are
  linked, not copied. Cite: Wang M *et al.* *Nature Biotechnology* 2016;34:828-837.
- **MoNA** (MassBank of North America, Fiehn Lab) — linked only. Its blanket CC BY
  default does not hold for its mirrored non-commercial content, and most records
  carry no per-record license field at all.
- **dl-de/by-2-0** records additionally require the German source note: provider
  name, the label `dl-de/by-2-0`, a link to the license text and the dataset URI.

## Structures and properties

InChIKeys, PubChem CIDs and XLogP values come from PubChem (NCBI), which places
no license restriction on its own computed content.

## Corrections

If your work is represented here and you would like the attribution changed,
corrected or removed, please open an issue.

## Other cited sources

Additional references recorded in individual rows:

- internal-knowledge *(2981)*
- https://www.rockefeller.edu/proteomics/prc-intranet/common-peptides/ *(168)*
- https://prospector.ucsf.edu/prospector/html/misc/trypsin.htm *(119)*
- https://www.epa.gov/sites/default/files/2019-12/documents/table_of_pfa *(7)*
- https://well-labs.com/docs/EPA%20method%20537_1_2018.PDF *(6)*
- https://pmc.ncbi.nlm.nih.gov/articles/PMC7005802/ *(3)*
- https://acif.ucr.edu/mass-spectrometry/useful-ms-related-information/u *(2)*
- https://community.agilent.com/knowledge/lcms-portal/kmp/lcms-articles/ *(1)*
- https://community.agilent.com/technical/lcms/f/forum/5480/how-do-we-ge *(1)*
- https://www.southampton.ac.uk/~msweb/help/contamination+.html [Mass Sp *(1)*
- http://mass-spec.stanford.edu/assets/SUMS_common_ESI_ions.pdf [Commonl *(1)*
