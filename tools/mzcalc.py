"""Exact-mass engine for the LC-MS contaminant table.

Parses Hill-notation molecular formulas and standard adduct notation
(e.g. [M+H]+, [2M+Na]+, [M+HCOO]-, [M+TFA-H]-, [M+2H]2+) and returns the
monoisotopic m/z, electron mass included.

Monoisotopic masses: CODATA/AME2020-consistent values as used by the
IUPAC/NIST atomic mass evaluation.
"""

import re

ELECTRON_MASS = 0.000548579909

# Monoisotopic (most-abundant-isotope) masses, u
ELEMENTS = {
    "H": 1.00782503207,
    "D": 2.0141017778,
    "He": 4.00260325415,
    "Li": 7.01600455,
    "B": 11.0093054,
    "C": 12.0,
    "N": 14.0030740048,
    "O": 15.9949146196,
    "F": 18.99840322,
    "Ne": 19.9924401754,
    "Na": 22.9897692809,
    "Mg": 23.985041699,
    "Al": 26.98153863,
    "Si": 27.9769265325,
    "P": 30.97376163,
    "S": 31.972071,
    "Cl": 34.96885268,
    "Ar": 39.9623831225,
    "K": 38.96370668,
    "Ca": 39.96259098,
    "Ti": 47.9479463,
    "V": 50.9439595,
    "Cr": 51.9405075,
    "Mn": 54.9380451,
    "Fe": 55.9349375,
    "Co": 58.933195,
    "Ni": 57.9353429,
    "Cu": 62.9295975,
    "Zn": 63.9291422,
    "As": 74.9215965,
    "Se": 79.9165213,
    "Br": 78.9183371,
    "Rb": 84.911789738,
    "Sr": 87.9056121,
    "Mo": 97.9054082,
    "Ag": 106.905097,
    "Cd": 113.9033585,
    "Sn": 119.9021947,
    "Sb": 120.9038157,
    "I": 126.904473,
    "Cs": 132.905451933,
    "Ba": 137.9052472,
    "Pt": 194.9647911,
    "Au": 196.9665687,
    "Hg": 201.970643,
    "Pb": 207.9766521,
    "Bi": 208.9803987,
}

# Shorthand used inside adduct brackets -> molecular formula
ADDUCT_ALIASES = {
    "ACN": "C2H3N",
    "MeCN": "C2H3N",
    "MeOH": "CH4O",
    "MEOH": "CH4O",
    "CH3OH": "CH4O",
    "EtOH": "C2H6O",
    "IPA": "C3H8O",
    "IsoProp": "C3H8O",
    "H2O": "H2O",
    "HAc": "C2H4O2",
    "AcOH": "C2H4O2",
    "CH3COOH": "C2H4O2",
    "CH3COO": "C2H3O2",
    "OAc": "C2H3O2",
    "Ac": "C2H3O2",
    "FA": "CH2O2",
    "HCOOH": "CH2O2",
    "HCOO": "CHO2",
    "CHO2": "CHO2",
    "For": "CHO2",
    "TFA": "C2HF3O2",
    "CF3COO": "C2F3O2",
    "TFAA": "C2F3O2",
    "DMSO": "C2H6OS",
    "DMF": "C3H7NO",
    "NH4": "H4N",
    "NH3": "H3N",
    "HCOONa": "CHO2Na",
    "NaCl": "NaCl",
    "KCl": "KCl",
    "HCl": "HCl",
    "NaOH": "HNaO",
    "THF": "C4H8O",
    "Gly": "C2H5NO2",
}

# Specific isotopes that appear in adduct notation as a mass-number prefix,
# e.g. [M+63Cu]+, [M+37Cl]-, [M+13C]+. Keyed (element, mass number).
ISOTOPE_MASSES = {
    ("H", 2): 2.0141017778,
    ("H", 3): 3.0160492777,
    ("Li", 6): 6.015122795,
    ("Li", 7): 7.01600455,
    ("B", 10): 10.0129370,
    ("B", 11): 11.0093054,
    ("C", 12): 12.0,
    ("C", 13): 13.0033548378,
    ("N", 14): 14.0030740048,
    ("N", 15): 15.0001088982,
    ("O", 16): 15.9949146196,
    ("O", 17): 16.99913170,
    ("O", 18): 17.9991610,
    ("S", 32): 31.972071,
    ("S", 33): 32.97145876,
    ("S", 34): 33.96786690,
    ("Cl", 35): 34.96885268,
    ("Cl", 37): 36.96590259,
    ("K", 39): 38.96370668,
    ("K", 41): 40.96182576,
    ("Ca", 40): 39.96259098,
    ("Fe", 54): 53.9396105,
    ("Fe", 56): 55.9349375,
    ("Cu", 63): 62.9295975,
    ("Cu", 65): 64.9277895,
    ("Zn", 64): 63.9291422,
    ("Zn", 66): 65.9260334,
    ("Br", 79): 78.9183371,
    ("Br", 81): 80.9162906,
    ("Ag", 107): 106.905097,
    ("Ag", 109): 108.904752,
}

# A leading number this large is read as a mass number, not a stoichiometric
# multiplier: no real adduct carries 6+ copies of one atom at low charge, while
# [M+12H]12+ (far from H's nominal mass) still parses as a multiplier.
ISOTOPE_PREFIX_MIN = 6

_TOKEN = re.compile(r"([A-Z][a-z]?)(\d*)")
_FORMULA_OK = re.compile(r"^(\([A-Za-z0-9]+\)\d*|[A-Z][a-z]?\d*)+$")


class FormulaError(ValueError):
    pass


def parse_formula(formula):
    """Return {element: count} for a molecular formula. Supports one level of
    parentheses, e.g. C6H4(CH3)2."""
    if formula is None:
        raise FormulaError("empty formula")
    f = str(formula).strip().replace(" ", "")
    # "NA"/"na" are the missing-value sentinel; "Na" (proper case) is sodium
    if not f or f in ("NA", "na", "nA") or f.upper() in ("N/A", "-", "NONE", "NULL"):
        raise FormulaError("NA formula")

    # square brackets are also used as grouping with a multiplier, e.g. the
    # cyclic siloxane "[C2H6SiO]5" -- normalise those to parentheses first so
    # they are not mistaken for the bracketed-ion notation handled below
    f = re.sub(r"^\[([^\[\]]+)\](\d+)$", r"(\1)\2", f)

    # sources often write a permanent cation as "[C16H36N]+"; the bracket/charge
    # notation is stripped and the charge is carried by the adduct instead
    m = re.match(r"^\[(.+)\](\d*[+-])?$", f)
    if m:
        f = m.group(1)
    f = re.sub(r"\d*[+-]$", "", f)
    if not f:
        raise FormulaError("empty formula after charge stripping: %r" % formula)

    # expand parenthesised groups
    while "(" in f:
        m = re.search(r"\(([^()]*)\)(\d*)", f)
        if not m:
            raise FormulaError("unbalanced parentheses in %r" % formula)
        mult = int(m.group(2)) if m.group(2) else 1
        inner = m.group(1)
        expanded = ""
        for el, ct in _TOKEN.findall(inner):
            if not el:
                continue
            n = int(ct) if ct else 1
            expanded += "%s%d" % (el, n * mult)
        if not _TOKEN.findall(inner):
            raise FormulaError("empty group in %r" % formula)
        f = f[: m.start()] + expanded + f[m.end():]

    counts = {}
    pos = 0
    for m in _TOKEN.finditer(f):
        if m.start() != pos:
            raise FormulaError("unparsable segment in %r near %r" % (formula, f[pos:m.start()]))
        pos = m.end()
        el = m.group(1)
        if el not in ELEMENTS:
            raise FormulaError("unknown element %r in %r" % (el, formula))
        counts[el] = counts.get(el, 0) + (int(m.group(2)) if m.group(2) else 1)
    if pos != len(f):
        raise FormulaError("trailing junk in %r" % formula)
    if not counts:
        raise FormulaError("no elements in %r" % formula)
    return counts


# Integer (nominal) masses of the same most-abundant isotopes. Needed to get the
# mass DEFECT right: defect = exact - nominal, and approximating nominal as
# round(m/z) silently flips the sign once the defect exceeds 0.5 Da, which is
# routine for lipids and long-chain species.
ELEMENTS_NOMINAL = {el: int(round(m)) for el, m in ELEMENTS.items()}


def monoisotopic_mass(formula, nominal=False):
    """Neutral monoisotopic mass of a molecular formula, or its nominal
    (integer-isotope) mass when nominal=True."""
    table = ELEMENTS_NOMINAL if nominal else ELEMENTS
    return sum(table[el] * n for el, n in parse_formula(formula).items())


# the oligomer multiplier is written either before M ([2M+H]+) or after it ([M2-H]-)
_ADDUCT_RE = re.compile(r"^\[\s*(\d*)\s*M\s*(\d*)\s*(.*?)\s*\](\d*)([+-])$")


class AdductError(ValueError):
    pass


def parse_adduct(adduct, nominal=False):
    """Parse adduct notation.

    Returns (n_M, delta_mass, charge, sign) where delta_mass is the net mass
    added to n*M by the adduct terms (electron mass NOT yet applied). With
    nominal=True the shift is computed from integer isotope masses.
    """
    if adduct is None:
        raise AdductError("empty adduct")
    a = str(adduct).strip().replace(" ", "")
    # normalise unicode minus / middle dot
    a = a.replace("−", "-").replace("·", "+")
    m = _ADDUCT_RE.match(a)
    if not m:
        raise AdductError("unparsable adduct %r" % adduct)

    pre, post = m.group(1), m.group(2)
    if pre and post:
        raise AdductError("multiplier given on both sides of M in %r" % adduct)
    n_m = int(pre or post) if (pre or post) else 1
    body = m.group(3)
    charge = int(m.group(4)) if m.group(4) else 1
    sign = m.group(5)
    if charge < 1:
        raise AdductError("charge < 1 in %r" % adduct)

    delta = 0.0
    if body:
        # split into signed terms, e.g. "+CH3OH+H" or "+TFA-H"
        terms = re.findall(r"([+-])(\d*)([A-Za-z0-9]+)", body)
        consumed = "".join("%s%s%s" % t for t in terms)
        if consumed != body:
            raise AdductError("unparsable adduct body %r in %r" % (body, adduct))
        for op, mult, token in terms:
            k = int(mult) if mult else 1
            mass = None

            # isotope-prefixed element, optionally with a count: 63Cu, 37Cl, 35Cl2
            if mult and k >= ISOTOPE_PREFIX_MIN:
                el_m = re.fullmatch(r"([A-Z][a-z]?)(\d*)", token)
                el = el_m.group(1) if el_m else None
                if el in ELEMENTS:
                    count = int(el_m.group(2)) if el_m.group(2) else 1
                    if (el, k) in ISOTOPE_MASSES:
                        mass = float(k) if nominal else ISOTOPE_MASSES[(el, k)]
                        k = count
                    elif abs(k - round(ELEMENTS[el])) <= 3:
                        raise AdductError(
                            "adduct %r looks like isotope %d%s but that isotope is not tabulated"
                            % (adduct, k, el))

            if mass is None:
                token_formula = ADDUCT_ALIASES.get(token, token)
                try:
                    mass = monoisotopic_mass(token_formula, nominal=nominal)
                except FormulaError as exc:
                    raise AdductError("bad adduct term %r in %r (%s)" % (token, adduct, exc))
            delta += (k * mass) if op == "+" else -(k * mass)

    return n_m, delta, charge, sign


def calc_mz(neutral_formula, adduct, nominal=False):
    """Monoisotopic m/z for a neutral formula + adduct, electron-mass corrected.
    With nominal=True returns the nominal (integer-isotope) m/z instead, which is
    what the mass defect must be measured against."""
    n_m, delta, charge, sign = parse_adduct(adduct, nominal=nominal)
    m = monoisotopic_mass(neutral_formula, nominal=nominal)
    total = n_m * m + delta
    if not nominal:
        # cations lose electrons, anions gain them
        total += (-charge * ELECTRON_MASS) if sign == "+" else (charge * ELECTRON_MASS)
    return total / charge


# Relative isotope contributions per atom, as a percentage of the monoisotopic
# peak: (A+1 abundance / A abundance, A+2 abundance / A abundance) x 100.
# Only elements that move the envelope measurably are listed.
ISOTOPE_CONTRIB = {
    "C": (1.0816, 0.0),
    "H": (0.0115, 0.0),
    "N": (0.3693, 0.0),
    "O": (0.0381, 0.2055),
    "S": (0.7893, 4.4741),
    "Si": (5.0778, 3.3528),
    "Cl": (0.0, 31.9614),
    "Br": (0.0, 97.2777),
    "K": (0.0, 7.2166),
    "Fe": (0.0, 0.0),
    "Li": (0.0, 0.0),
    "B": (24.8391, 0.0),
    "Cu": (0.0, 44.7442),
    "Zn": (0.0, 57.3703),
}


def isotope_pattern(neutral_formula):
    """Approximate M+1 and M+2 intensities as a percentage of the monoisotopic
    peak, from elemental composition.

    This is what lets an observed envelope narrow a candidate list: M+1 is
    essentially a carbon count (~1.1% per carbon), while a large M+2 is a
    halogen or sulfur fingerprint -- roughly 32% for one chlorine, 65% for two,
    97% for one bromine, 4.5% for one sulfur.

    Returns (m1_percent, m2_percent).
    """
    counts = parse_formula(neutral_formula)
    m1 = m2 = 0.0
    for el, n in counts.items():
        a1, a2 = ISOTOPE_CONTRIB.get(el, (0.0, 0.0))
        m1 += n * a1
        m2 += n * a2
    # two heavy carbons landing together is the dominant second-order term
    nc = counts.get("C", 0)
    if nc > 1:
        m2 += (nc * (nc - 1) / 2.0) * (0.010816 ** 2) * 100.0
    return m1, m2


# Full isotope tables: (mass, fractional abundance) per element, needed because
# the M+1/M+2 shortcut above is only valid when the lightest isotope is also the
# most abundant. That is false for most metals -- 54Fe sits 2 Da BELOW 56Fe, and
# 10B sits 1 Da below 11B -- so a metal-containing ion has intensity at M-1/M-2
# that a "monoisotopic plus M+1 plus M+2" model cannot express at all.
ISOTOPES = {
    "H": [(1.00782503207, 0.999885), (2.0141017778, 0.000115)],
    "C": [(12.0, 0.9893), (13.0033548378, 0.0107)],
    "N": [(14.0030740048, 0.99632), (15.0001088982, 0.00368)],
    "O": [(15.9949146196, 0.99757), (16.99913170, 0.00038), (17.99916100, 0.00205)],
    "F": [(18.99840322, 1.0)],
    "Na": [(22.9897692809, 1.0)],
    "Si": [(27.9769265325, 0.922297), (28.976494700, 0.046832), (29.973770170, 0.030872)],
    "P": [(30.97376163, 1.0)],
    "S": [(31.97207100, 0.9499), (32.97145876, 0.0075), (33.96786690, 0.0425),
          (35.96708076, 0.0001)],
    "Cl": [(34.96885268, 0.7576), (36.96590259, 0.2424)],
    "K": [(38.96370668, 0.932581), (39.96399848, 0.000117), (40.96182576, 0.067302)],
    "Ca": [(39.96259098, 0.96941), (41.95861801, 0.00647), (42.95876660, 0.00135),
           (43.95548180, 0.02086)],
    "Br": [(78.9183371, 0.5069), (80.9162906, 0.4931)],
    "I": [(126.904473, 1.0)],
    "Li": [(6.015122795, 0.0759), (7.01600455, 0.9241)],
    "B": [(10.0129370, 0.199), (11.0093054, 0.801)],
    "Cr": [(49.9460442, 0.04345), (51.9405075, 0.83789), (52.9406494, 0.09501),
           (53.9388804, 0.02365)],
    "Fe": [(53.9396105, 0.05845), (55.9349375, 0.91754), (56.9353940, 0.02119),
           (57.9332756, 0.00282)],
    "Ni": [(57.9353429, 0.680769), (59.9307864, 0.262231), (60.9310560, 0.011399),
           (61.9283451, 0.036345), (63.9279660, 0.009256)],
    # MP35N alloy flow paths (Co 35 / Ni 35 / Cr 20 / Mo 10, essentially Fe-free)
    # shed a very different metal set from stainless steel. Note Co is
    # MONOISOTOPIC -- a cobalt complex shows no metal satellite whatsoever, which
    # is itself diagnostic. Mo is the opposite: seven isotopes spanning M-6..M+2.
    "Co": [(58.9331950, 1.0)],
    # Ti/Al frits. Titanium is the most distinctive metal in the whole set:
    # intensity sits BOTH below (46Ti, 47Ti) and above (49Ti, 50Ti) its base
    # peak. Aluminium, like cobalt, is monoisotopic and shows no satellite.
    "Ti": [(45.9526316, 0.0825), (46.9517631, 0.0744), (47.9479463, 0.7372),
           (48.9478700, 0.0541), (49.9447912, 0.0518)],
    "Al": [(26.98153863, 1.0)],
    "Mo": [(91.906811, 0.1484), (93.9050883, 0.0925), (94.9058421, 0.1592),
           (95.9046795, 0.1668), (96.9060215, 0.0955), (97.9054082, 0.2413),
           (99.907477, 0.0963)],
    "Cu": [(62.9295975, 0.6915), (64.9277895, 0.3085)],
    "Zn": [(63.9291422, 0.48268), (65.9260334, 0.27975), (66.9271273, 0.04102),
           (67.9248442, 0.19024), (69.9253193, 0.00631)],
    "Sn": [(111.904818, 0.0097), (113.902779, 0.0066), (114.903342, 0.0034),
           (115.901741, 0.1454), (116.902952, 0.0768), (117.901603, 0.2422),
           (118.903308, 0.0859), (119.9021947, 0.3258), (121.9034390, 0.0463),
           (123.9052739, 0.0579)],
}


def isotope_envelope(neutral_formula, adduct="[M]+", min_rel=0.001, max_peaks=12):
    """Full isotope envelope by convolution, as [(m/z, relative intensity)].

    Intensities are relative to the MOST ABUNDANT peak, which is not always the
    lightest one -- that distinction is the whole point for metal complexes.
    Peaks below the monoisotopic mass are therefore included and are the clearest
    single indicator that a polyisotopic element is present.
    """
    counts = parse_formula(neutral_formula)
    # convolve one element at a time; each entry is {mass offset: abundance}
    dist = [(0.0, 1.0)]
    for el, n in counts.items():
        iso = ISOTOPES.get(el)
        if iso is None:
            iso = [(ELEMENTS[el], 1.0)]
        for _ in range(n):
            merged = {}
            for m0, a0 in dist:
                for m1, a1 in iso:
                    a = a0 * a1
                    if a < 1e-9:
                        continue
                    key = round(m0 + m1, 4)
                    merged[key] = merged.get(key, 0.0) + a
            dist = sorted(merged.items())
            if len(dist) > 400:   # prune negligible branches to keep this tractable
                top = max(a for _m, a in dist)
                dist = [(m, a) for m, a in dist if a >= top * 1e-7]

    n_m, delta, charge, sign = parse_adduct(adduct)
    if n_m != 1:
        raise AdductError("isotope_envelope handles [M...] adducts only, not %r" % adduct)
    shift = delta + ((-charge * ELECTRON_MASS) if sign == "+" else (charge * ELECTRON_MASS))

    peaks = [((m + shift) / charge, a) for m, a in dist]
    top = max(a for _m, a in peaks)
    peaks = [(m, a / top) for m, a in peaks if a / top >= min_rel]
    peaks.sort(key=lambda p: -p[1])
    peaks = sorted(peaks[:max_peaks])
    return peaks


def mass_defect(neutral_formula, adduct):
    """(absolute defect in Da, relative defect in ppm) for an ion.

    Defect is exact minus nominal, with nominal derived from the formula rather
    than from rounding the m/z -- so fluorine-rich species come out correctly
    negative and lipids correctly above +0.5 Da.
    """
    exact = calc_mz(neutral_formula, adduct)
    nom = calc_mz(neutral_formula, adduct, nominal=True)
    d = exact - nom
    return d, (d / exact * 1e6 if exact else float("nan"))


def ppm_error(observed, theoretical):
    if not theoretical:
        return float("nan")
    return (observed - theoretical) / theoretical * 1e6
