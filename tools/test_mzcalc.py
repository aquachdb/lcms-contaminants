"""Unit tests for mzcalc: formula parsing, adduct parsing, exact m/z.

Reference m/z values are standard published monoisotopic values (4 dp).
Run: python test_mzcalc.py
"""

import sys

from mzcalc import (
    AdductError,
    FormulaError,
    calc_mz,
    monoisotopic_mass,
    parse_adduct,
    parse_formula,
)

FAILS = []


def check(label, got, want, tol=5e-4):
    ok = abs(got - want) <= tol
    if not ok:
        FAILS.append("%s: got %.5f want %.5f (d=%.5f)" % (label, got, want, got - want))
    print("%-4s %-46s got %12.5f  want %12.5f" % ("ok" if ok else "FAIL", label, got, want))


def check_eq(label, got, want):
    ok = got == want
    if not ok:
        FAILS.append("%s: got %r want %r" % (label, got, want))
    print("%-4s %-46s %r" % ("ok" if ok else "FAIL", label, got))


def check_raises(label, fn, exc):
    try:
        fn()
    except exc:
        print("%-4s %-46s raised %s" % ("ok", label, exc.__name__))
        return
    except Exception as e:  # wrong exception type
        FAILS.append("%s: raised %r, expected %s" % (label, e, exc.__name__))
        print("%-4s %-46s wrong exception %r" % ("FAIL", label, e))
        return
    FAILS.append("%s: did not raise %s" % (label, exc.__name__))
    print("%-4s %-46s no exception" % ("FAIL", label))


print("--- formula parsing ---")
check_eq("parse C8H10N4O2", parse_formula("C8H10N4O2"), {"C": 8, "H": 10, "N": 4, "O": 2})
check_eq("parse with parens C6H4(CH3)2", parse_formula("C6H4(CH3)2"), {"C": 8, "H": 10})
check_eq("parse single atom Na", parse_formula("Na"), {"Na": 1})
check_eq("two-letter vs two elements: CO vs Co",
         (parse_formula("CO"), parse_formula("Co")), ({"C": 1, "O": 1}, {"Co": 1}))
check("neutral mass water", monoisotopic_mass("H2O"), 18.0106)
check("neutral mass glucose C6H12O6", monoisotopic_mass("C6H12O6"), 180.0634)
check("neutral mass DEHP C24H38O4", monoisotopic_mass("C24H38O4"), 390.2770)
check_raises("unknown element rejected", lambda: monoisotopic_mass("C6Xy2"), FormulaError)
check_raises("NA formula rejected", lambda: monoisotopic_mass("NA"), FormulaError)

print("\n--- adduct parsing ---")
check_eq("parse [M+H]+ multiplicity/charge", parse_adduct("[M+H]+")[0::2], (1, 1))
check_eq("parse [2M+Na]+ multiplicity", parse_adduct("[2M+Na]+")[0], 2)
check_eq("parse [M+2H]2+ charge", parse_adduct("[M+2H]2+")[2], 2)
check_eq("parse [M-H]- sign", parse_adduct("[M-H]-")[3], "-")
check_raises("garbage adduct rejected", lambda: parse_adduct("M+H"), AdductError)
check_raises("bad adduct term rejected", lambda: parse_adduct("[M+Zz]+"), AdductError)

print("\n--- positive-mode m/z ---")
check("caffeine C8H10N4O2 [M+H]+", calc_mz("C8H10N4O2", "[M+H]+"), 195.0877)
check("verapamil C27H38N2O4 [M+H]+", calc_mz("C27H38N2O4", "[M+H]+"), 455.2904)
# 609.2807 electron-corrected; the widely quoted 609.2812 omits the electron mass
check("reserpine C33H40N2O9 [M+H]+", calc_mz("C33H40N2O9", "[M+H]+"), 609.2807)
check("DEHP C24H38O4 [M+H]+", calc_mz("C24H38O4", "[M+H]+"), 391.2843)
check("DEHP C24H38O4 [M+Na]+", calc_mz("C24H38O4", "[M+Na]+"), 413.2662)
check("DEHP C24H38O4 [M+NH4]+", calc_mz("C24H38O4", "[M+NH4]+"), 408.3108)
check("phthalic anhydride C8H4O3 [M+H]+ (m/z 149)", calc_mz("C8H4O3", "[M+H]+"), 149.0233)
check("glucose [M+Na]+", calc_mz("C6H12O6", "[M+Na]+"), 203.0526)
check("glucose [M+K]+", calc_mz("C6H12O6", "[M+K]+"), 219.0266)
check("glucose [2M+Na]+", calc_mz("C6H12O6", "[2M+Na]+"), 383.1160)
check("glucose [M+2H]2+", calc_mz("C6H12O6", "[M+2H]2+"), 91.0390)
check("PEG n=10 C20H42O11 [M+NH4]+", calc_mz("C20H42O11", "[M+NH4]+"), 476.3065)
check("D5 siloxane C10H30O5Si5 [M+H]+", calc_mz("C10H30O5Si5", "[M+H]+"), 371.1015)
check("erucamide C22H43NO [M+H]+", calc_mz("C22H43NO", "[M+H]+"), 338.3417)
check("ACN dimer+H  [2M+H]+ of C2H3N", calc_mz("C2H3N", "[2M+H]+"), 83.0604)

print("\n--- negative-mode m/z ---")
check("palmitic acid C16H32O2 [M-H]-", calc_mz("C16H32O2", "[M-H]-"), 255.2330)
check("glucose [M-H]-", calc_mz("C6H12O6", "[M-H]-"), 179.0561)
check("glucose [M+Cl]-", calc_mz("C6H12O6", "[M+Cl]-"), 215.0328)
check("glucose [M+HCOO]-", calc_mz("C6H12O6", "[M+HCOO]-"), 225.0616)
check("glucose [M+CH3COO]-", calc_mz("C6H12O6", "[M+CH3COO]-"), 239.0772)
check("glucose [M+TFA-H]-", calc_mz("C6H12O6", "[M+TFA-H]-"), 293.0490)
check("PFOA C8HF15O2 [M-H]-", calc_mz("C8HF15O2", "[M-H]-"), 412.9664)
check("PFOS C8HF17O3S [M-H]-", calc_mz("C8HF17O3S", "[M-H]-"), 498.9302)
check("SDS C12H26O4S [M-H]-", calc_mz("C12H26O4S", "[M-H]-"), 265.1479)
check("BPA C15H16O2 [M-H]-", calc_mz("C15H16O2", "[M-H]-"), 227.1078)

print("\n--- isotope-prefixed adducts (mass number, not a multiplier) ---")
# ACN + Cu(I): the classic copper-adduct assignment, ~m/z 104 not ~4000
check("ACN [M+63Cu]+", calc_mz("C2H3N", "[M+63Cu]+"), 103.9556)
check("ACN [2M+63Cu]+", calc_mz("C2H3N", "[2M+63Cu]+"), 144.9822)
check("ACN [M+65Cu]+", calc_mz("C2H3N", "[M+65Cu]+"), 105.9538)
check("glucose [M+37Cl]-", calc_mz("C6H12O6", "[M+37Cl]-"), 217.0299)
# a real multiplier far from any isotope mass number must still be a multiplier
check("multiplier survives: [M+12H]12+ of C6H12O6",
      calc_mz("C6H12O6", "[M+12H]12+"), 16.0125)
check("small multiplier unaffected: [M+3H]3+", calc_mz("C6H12O6", "[M+3H]3+"), 61.0286)
check_raises("untabulated isotope flagged, not silently multiplied",
             lambda: parse_adduct("[M+64Cu]+"), AdductError)
# isotope with a stoichiometric count, as MaConDa writes triethylamine.HCl clusters
check_eq("35Cl2 is two 35Cl atoms, not 35x Cl2",
         round(parse_adduct("[M+35Cl2]+")[1], 5), round(2 * 34.96885268, 5))
check_eq("37Cl2 uses the heavy isotope mass",
         round(parse_adduct("[M+37Cl2]+")[1], 5), round(2 * 36.96590259, 5))
# MaConDa's iron-acetate triangle: M6 multiplier plus multi-atom terms
check("acetic acid [M6-H6+Fe3+O]+ iron carboxylate triangle",
      calc_mz("C2H4O2", "[M6-H6+Fe3+O]+"), 537.8790, tol=2e-3)

print("\n--- source-style notation variants ---")
# permanent cations are often written with brackets and a charge
check("bracketed cation formula [C16H36N]+ as M",
      calc_mz("[C16H36N]+", "[M]+"), 242.2842)
check("trailing-charge formula C16H36N+", calc_mz("C16H36N+", "[M]+"), 242.2842)
# multiplier written after M rather than before
check_eq("[M2-H]- == [2M-H]-",
         round(calc_mz("CH2O2", "[M2-H]-"), 5) == round(calc_mz("CH2O2", "[2M-H]-"), 5), True)
check("[M2+Na-2H]- sodiated formic acid dimer",
      calc_mz("CH2O2", "[M2+Na-2H]-"), 112.9856)
check_raises("multiplier on both sides rejected",
             lambda: parse_adduct("[2M2+H]+"), AdductError)
# square brackets as a grouping multiplier: Keller writes cyclic siloxane D5 this way
check_eq("[C2H6SiO]5 == C10H30O5Si5",
         parse_formula("[C2H6SiO]5"), parse_formula("C10H30O5Si5"))
check("[C2H6SiO]5 [M+H]+ is the D5 background ion",
      calc_mz("[C2H6SiO]5", "[M+H]+"), 371.1012)
check_eq("[C2H6SiO]6 == C12H36O6Si6",
         parse_formula("[C2H6SiO]6"), parse_formula("C12H36O6Si6"))

print("\n--- ion composition: the canonical identity of an ion ---")
from mzcalc import canonical_adduct, hill_formula, ion_composition  # noqa: E402


def ic(formula, adduct):
    return ion_composition(formula, adduct)


# the four spellings of the sodiated formic acid dimer that the table carried as
# four separate rows -- including one with the whole cluster baked into the
# "neutral" and an [M]- adduct
FORMATE_CLUSTER = [
    ("CH2O2", "[2M+Na-2H]-"),
    ("CH2O2", "[M2+Na-2H]-"),
    ("H2CO2", "[M2+Na-H2]-"),          # non-Hill neutral, loss written as H2
    ("C2H2NaO4", "[M]-"),              # cluster baked into the neutral
]
first = ic(*FORMATE_CLUSTER[0])
check_eq("sodium formate cluster resolves to C2H2NaO4 1-",
         (first.formula, first.charge, first.sign), ("C2H2NaO4", 1, "-"))
for f, a in FORMATE_CLUSTER[1:]:
    check_eq("  %-12s %-14s is the same ion" % (f, a), ic(f, a), first)

# 2M and M2 are the same multiplier, whichever side of M it is written
check_eq("[2M+H]+ == [M2+H]+ (DMSO dimer)",
         ic("C2H6OS", "[2M+H]+") == ic("C2H6OS", "[M2+H]+"), True)
check_eq("[3M+Na]+ == [M3+Na]+", ic("C2H6OS", "[3M+Na]+") == ic("C2H6OS", "[M3+Na]+"), True)

# the four spellings of PO3- that phosphoric acid was listed under
PO3 = [("H3PO4", "[M-H2O-H]-"), ("H3PO4", "[M-H3O]-"), ("HPO3", "[M-H]-"), ("O3P", "[M]-")]
po3 = ic(*PO3[0])
check_eq("[M-H2O-H]- of phosphoric acid is O3P 1-",
         (po3.formula, po3.charge, po3.sign), ("O3P", 1, "-"))
for f, a in PO3[1:]:
    check_eq("  %-8s %-12s is the same ion" % (f, a), ic(f, a), po3)

# multiply-charged: charge is part of the identity, composition alone is not
check_eq("[M+2H]2+ carries charge 2 and both protons",
         (ic("C6H12O6", "[M+2H]2+").formula, ic("C6H12O6", "[M+2H]2+").charge),
         ("C6H14O6", 2))
check_eq("[M+2H]2+ is NOT the same ion as [M+2H]+ at half the mass",
         ic("C6H12O6", "[M+2H]2+") == ic("C6H12O6", "[M+2H]+"), False)
check_eq("[2M+2H]2+ is not the same ion as [M+H]+",
         ic("C6H12O6", "[2M+2H]2+") == ic("C6H12O6", "[M+H]+"), False)

# isotope-prefixed terms stay distinct pseudo-elements
check_eq("[M+63Cu]+ composition keeps the mass number",
         ic("C2H3N", "[M+63Cu]+").formula, "C2H3[63Cu]N")
check_eq("63Cu and 65Cu adducts are different ions",
         ic("C2H3N", "[M+63Cu]+") == ic("C2H3N", "[M+65Cu]+"), False)
check_eq("63Cu adduct is not merged with natural-abundance Cu",
         ic("C2H3N", "[M+63Cu]+") == ic("C2H3N", "[M+Cu]+"), False)
check_eq("oxidation state is not iodine: [M+63Cu(I)]+ == [M+63Cu]+",
         ic("C2H3N", "[M+63Cu(I)]+") == ic("C2H3N", "[M+63Cu]+"), True)
check_eq("parenthesized loss group: [M-(H2O)2]+ == [M-2H2O]+",
         ic("C6H12O6", "[M-(H2O)2+H]+") == ic("C6H12O6", "[M-2H2O+H]+"), True)

# ---- THE NEGATIVE CONTROL -------------------------------------------------
# Trifluoroacetate and the sodium formate cluster are both m/z 112.9856 in
# negative mode. They are chemically different ions and MUST NOT merge. If this
# test ever passes as "equal", the whole table has been corrupted into claiming
# that mass can separate species -- which is the one thing it cannot do.
tfa = ic("C2HF3O2", "[M-H]-")
naform = ic("CH2O2", "[2M+Na-2H]-")
check("trifluoroacetate m/z", calc_mz("C2HF3O2", "[M-H]-"), 112.9856)
check("sodium formate cluster m/z", calc_mz("CH2O2", "[2M+Na-2H]-"), 112.9856)
check_eq("...they agree to well under 1 mDa",
         abs(calc_mz("C2HF3O2", "[M-H]-") - calc_mz("CH2O2", "[2M+Na-2H]-")) < 5e-4, True)
check_eq("ISOBARIC BUT DIFFERENT: C2F3O2- vs C2H2NaO4- must NOT merge",
         tfa == naform, False)
check_eq("  trifluoroacetate composition", tfa.formula, "C2F3O2")
check_eq("  sodium formate cluster composition", naform.formula, "C2H2NaO4")
# The app's other worked example is NOT the same case and must not be treated
# as one: protonated N-methylpyrrolidone and the acetone/acetonitrile cluster
# have the SAME elemental composition (C5H10NO+), so they are one ion arising
# from two sources -- exactly what the merge is meant to record -- not two ions.
check_eq("N-methylpyrrolidone [M+H]+ IS composition-identical to the ACN/acetone cluster",
         ic("C5H9NO", "[M+H]+") == ic("C3H6O", "[M+CH3CN+H]+"), True)
check_eq("  ...and that composition is C5H10NO", ic("C5H9NO", "[M+H]+").formula, "C5H10NO")

# None, never a guess
check_eq("no formula -> None", ic("NA", "[M+H]+"), None)
check_eq("unparsable adduct -> None", ic("C6H12O6", "M+H"), None)
check_eq("unknown adduct term -> None", ic("C6H12O6", "[M+Zz]+"), None)
check_eq("loss larger than the molecule -> None (a data error, not notation)",
         ic("C2F3NaO2", "[M-H]-"), None)
check_eq("untabulated isotope -> None", ic("C2H3N", "[M+64Cu]+"), None)

print("\n--- Hill notation and canonical adduct notation ---")
check_eq("Hill: carbon, hydrogen, then alphabetical",
         hill_formula("O4SH2"), "H2O4S")
check_eq("Hill: no carbon -> all alphabetical", hill_formula("PH3O4"), "H3O4P")
check_eq("Hill: carbon first even when written last", hill_formula("H2CO2"), "CH2O2")

CANON = [
    ("[M2+Na-2H]-", "[2M+Na-2H]-"),      # multiplier moves in front of M
    ("[M2+Na-H2]-", "[2M+Na-2H]-"),      # ...and a suffix count becomes a prefix
    ("[2M+Na-2H]-", "[2M+Na-2H]-"),      # already canonical: unchanged
    ("[M+H]+", "[M+H]+"),
    ("[M+1H]1+", "[M+H]+"),              # redundant 1s dropped
    ("[M+2H]2+", "[M+2H]2+"),            # real charge kept
    ("[M+Na+CH3CN]+", "[M+CH3CN+Na]+"),  # charge carrier written last
    ("[M+ACN+Na]+", "[M+CH3CN+Na]+"),    # shorthand normalized
    ("[M+H+C3H7NO]+", "[M+DMF+H]+"),
    ("[M+H+CH2O2]+", "[M+HCOOH+H]+"),
    ("[M-H2O-H]-", "[M-H2O-H]-"),        # heaviest loss first
    ("[M-H-H2O]-", "[M-H2O-H]-"),
    ("[M-H2O+H]+", "[M+H-H2O]+"),        # additions before losses
    ("[M+C2HF3O2-H]-", "[M+TFA-H]-"),
    ("[M+TFA+TFA-H]-", "[M+2TFA-H]-"),   # repeats collapse into a count
    ("[M+35Cl2]+", "[M+35Cl2]+"),        # isotope count stays a suffix
    ("[M4-H3+Na4]+", "[4M+4Na-3H]+"),
    ("[M+6H]6+", "[M+6H]6+"),            # a real multiplier, not an isotope
    ("[M]-", "[M]-"),
    ("[M]2-", "[M]2-"),
]
for src, want in CANON:
    check_eq("canonical %-16s" % src, canonical_adduct(src), want)
check_eq("unparsable adduct -> None", canonical_adduct("M+H"), None)

# a notational normal form must never change the chemistry: every canonical
# form re-parses to the same ion and the same m/z
for src, _want in CANON:
    got = canonical_adduct(src)
    check_eq("round-trip composition %-16s" % src,
             ion_composition("C6H12O6", got) == ion_composition("C6H12O6", src), True)
    check_eq("round-trip m/z         %-16s" % src,
             round(calc_mz("C6H12O6", got), 6) == round(calc_mz("C6H12O6", src), 6), True)

# the SDS shorthand: parse_formula would otherwise read it as sulfur-deuterium-
# sulfur, which is 222 Da light and a silently wrong ion
check("SDS cluster [M+SDS-Na]- is the dimer, not S2D",
      calc_mz("C12H25NaO4S", "[M+SDS-Na]-"), 553.2850)

print("\n--- mass defect (nominal from formula, not from rounding m/z) ---")
from mzcalc import mass_defect  # noqa: E402
# fluorine-rich: defect is NEGATIVE, the classic PFAS signature
d, ppm = mass_defect("C8HF15O2", "[M-H]-")
check("PFOA [M-H]- defect is negative", d, -0.0336, tol=2e-3)
check_eq("PFOA relative mass defect is negative", ppm < 0, True)
# lipid-like: defect exceeds +0.5 Da, where round(m/z) would flip the sign
d, ppm = mass_defect("C32H64O2", "[M+NH4]+")
check_eq("cetyl palmitate defect stays positive above 0.5 Da", d > 0.5, True)
check_eq("...and its RMD is large and positive", ppm > 900, True)
# siloxane sits between the two
d, ppm = mass_defect("C10H30O5Si5", "[M+H]+")
check("D5 [M+H]+ defect", d, 0.1012, tol=2e-3)
check_eq("D5 RMD is well below the CHNO band", 200 < ppm < 350, True)
check("caffeine [M+H]+ defect", mass_defect("C8H10N4O2", "[M+H]+")[0], 0.0877, tol=2e-3)

print("\n--- full isotope envelopes (metals break the M+1/M+2 model) ---")
from mzcalc import isotope_envelope  # noqa: E402

env = isotope_envelope("FeC10H14N2O8", "[M]+")   # [Fe(III)+EDTA-2H]+
base = [m for m, i in env if i == 1.0][0]
below = [(m, i) for m, i in env if m < base - 1.5]
check_eq("Fe complex has a peak ~2 Da BELOW the main peak (54Fe)", len(below) >= 1, True)
check("...and it is ~6% of the base peak", below[0][1] * 100, 6.4, tol=0.6)
# 57Fe and 13C both land at M+1 but are resolvable 3 mDa apart
m1 = sorted([(m, i) for m, i in env if base + 0.5 < m < base + 1.5])
check_eq("M+1 of the Fe complex is split into fine structure", len(m1) >= 2, True)

env = isotope_envelope("C12H7Cl3O2", "[M-H]-")   # triclosan, 3 chlorines
b = [m for m, i in env if i == 1.0][0]
m2 = max(i for m, i in env if b + 1.5 < m < b + 2.5)
m4 = max(i for m, i in env if b + 3.5 < m < b + 4.5)
check("triclosan M+2 is ~96% (three Cl)", m2 * 100, 96.0, tol=4)
check("triclosan M+4 is ~31% (three Cl)", m4 * 100, 30.7, tol=4)

# for a silicon compound the lumped M+1 is dominated by 29Si, not by carbon
env = isotope_envelope("C10H30O5Si5", "[M+H]+")
b = [m for m, i in env if i == 1.0][0]
si_peak = [i for m, i in env if abs(m - (b + 0.9996)) < 0.002]
c_peak = [i for m, i in env if abs(m - (b + 1.0034)) < 0.002]
check_eq("D5 M+1 resolves into a 29Si peak and a 13C peak", bool(si_peak and c_peak), True)
check_eq("...and 29Si is the larger of the two", si_peak[0] > c_peak[0], True)

print("\n--- electron mass is applied (pos and neg differ from naive) ---")
naive_pos = monoisotopic_mass("C6H12O6") + monoisotopic_mass("H")
check_eq("cation lighter than naive M+H by ~1 electron",
         round(naive_pos - calc_mz("C6H12O6", "[M+H]+"), 6), 0.000549)
naive_neg = monoisotopic_mass("C6H12O6") - monoisotopic_mass("H")
check_eq("anion heavier than naive M-H by ~1 electron",
         round(calc_mz("C6H12O6", "[M-H]-") - naive_neg, 6), 0.000549)

print("\n%d checks failed" % len(FAILS))
for f in FAILS:
    print("  " + f)
sys.exit(1 if FAILS else 0)
