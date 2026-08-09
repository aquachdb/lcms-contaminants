# =====================================================================
# GENERATED FILE -- DO NOT EDIT IN PLACE.
#
# Source of truth : scripts/mzcalc.py
# Regenerate with : python scripts/sync_published.py
#
# Edits made here are overwritten by the next sync and will fail the
# drift check in `python tools/check_site.py`. Change the source file.
# =====================================================================
# --- generated header ends; everything below is verbatim source ---
"""Exact-mass engine for the LC-MS contaminant table.

Parses Hill-notation molecular formulas and standard adduct notation
(e.g. [M+H]+, [2M+Na]+, [M+HCOO]-, [M+TFA-H]-, [M+2H]2+) and returns the
monoisotopic m/z, electron mass included.

Beyond mass, it also answers *which ion is this* -- `ion_composition()` returns
the ion's elemental composition, charge and sign, which is the only stable
identity a contaminant table has. m/z is not: two chemically different ions are
routinely isobaric. Nor is the (name, adduct) pair: the same physical ion gets
spelled a dozen ways ([2M+Na-2H]- and [M2+Na-H2]- and a cluster baked into the
"neutral" as [M]-), which is what makes a name/notation-keyed table duplicate
itself.

Monoisotopic masses: CODATA/AME2020-consistent values as used by the
IUPAC/NIST atomic mass evaluation.
"""

import collections
import math
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
    # Without this, parse_formula reads "SDS" as sulfur-deuterium-sulfur (D is a
    # tabulated element) and silently returns a mass 222 Da too light.
    "SDS": "C12H25NaO4S",
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

# one signed adduct term: an optional multiplier then a formula, where the
# formula may itself contain parenthesised groups -- MaConDa writes double water
# loss as "-(H2O)2"
_ADDUCT_TERM_RE = re.compile(
    r"([+-])(\d*)((?:\([A-Za-z0-9]+\)\d*|[A-Za-z0-9]+)+)")

# "Cu(I)" / "Fe(III)" is an oxidation state, not a formula. Left in place it
# would parse as copper plus IODINE. Only stripped when it directly follows an
# element symbol, holds nothing but roman-numeral letters, and carries no
# multiplier -- so a real group such as "(H2O)2" is untouched.
_OXIDATION_STATE_RE = re.compile(r"(?<=[A-Za-z])\((?:I{1,3}|IV|VI{0,3}|IX|X)\)(?![A-Za-z0-9])")


class AdductError(ValueError):
    pass


def _adduct_terms(adduct):
    """Tokenise adduct notation. The single grammar every reader shares.

    Returns (n_M, terms, charge, sign) with terms a list of
    (op, count, token, isotope) and isotope either None or an (element,
    mass_number) pair. Raises AdductError.
    """
    if adduct is None:
        raise AdductError("empty adduct")
    a = str(adduct).strip().replace(" ", "")
    # normalise unicode minus / middle dot
    a = a.replace("−", "-").replace("·", "+")
    a = _OXIDATION_STATE_RE.sub("", a)
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

    terms = []
    if body:
        # split into signed terms, e.g. "+CH3OH+H" or "+TFA-H"
        raw = _ADDUCT_TERM_RE.findall(body)
        consumed = "".join("%s%s%s" % t for t in raw)
        if consumed != body:
            raise AdductError("unparsable adduct body %r in %r" % (body, adduct))
        for op, mult, token in raw:
            k = int(mult) if mult else 1
            isotope = None

            # isotope-prefixed element, optionally with a count: 63Cu, 37Cl, 35Cl2
            if mult and k >= ISOTOPE_PREFIX_MIN:
                el_m = re.fullmatch(r"([A-Z][a-z]?)(\d*)", token)
                el = el_m.group(1) if el_m else None
                if el in ELEMENTS:
                    count = int(el_m.group(2)) if el_m.group(2) else 1
                    if (el, k) in ISOTOPE_MASSES:
                        isotope = (el, k)
                        k = count
                    elif abs(k - round(ELEMENTS[el])) <= 3:
                        raise AdductError(
                            "adduct %r looks like isotope %d%s but that isotope is not tabulated"
                            % (adduct, k, el))
            terms.append((op, k, token, isotope))
    return n_m, terms, charge, sign


def parse_adduct(adduct, nominal=False):
    """Parse adduct notation.

    Returns (n_M, delta_mass, charge, sign) where delta_mass is the net mass
    added to n*M by the adduct terms (electron mass NOT yet applied). With
    nominal=True the shift is computed from integer isotope masses.
    """
    n_m, terms, charge, sign = _adduct_terms(adduct)

    delta = 0.0
    for op, k, token, isotope in terms:
        if isotope is not None:
            mass = float(isotope[1]) if nominal else ISOTOPE_MASSES[isotope]
        else:
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


# ============================================================== ion identity ==
#
# The canonical identity of an ion is its ELEMENTAL COMPOSITION plus charge and
# sign. Everything else a table records about it -- the compound it came from,
# the adduct notation someone chose, the m/z -- is either a many-to-one label or
# an ambiguous measurement.

_SYMBOL_RE = re.compile(r"^(\d*)([A-Z][a-z]?)$")


def _hill_key(symbol):
    """Sort key for a plain element or an isotope pseudo-element ('63Cu').

    Isotopes sort immediately after the element they label, so 12C/13C stay
    together rather than scattering into the numeric part of the alphabet.
    """
    m = _SYMBOL_RE.match(symbol)
    if not m:
        return (symbol, 0)
    return (m.group(2), int(m.group(1)) if m.group(1) else 0)


def _as_counts(counts):
    """Accept a formula string, a mapping, or an iterable of (symbol, count)."""
    if isinstance(counts, str):
        return parse_formula(counts)
    if hasattr(counts, "items"):
        return dict(counts)
    return dict(counts)


def hill_composition(counts):
    """(symbol, count) pairs in Hill order, as a hashable tuple.

    Hill order is carbon, then hydrogen, then everything else alphabetically;
    with no carbon present, everything alphabetically. Zero counts are dropped.
    """
    items = [(s, n) for s, n in _as_counts(counts).items() if n]
    items.sort(key=lambda kv: _hill_key(kv[0]))
    if any(_hill_key(s)[0] == "C" for s, _ in items):
        head = [kv for kv in items if _hill_key(kv[0])[0] in ("C", "H")]
        head.sort(key=lambda kv: (0 if _hill_key(kv[0])[0] == "C" else 1, _hill_key(kv[0])[1]))
        items = head + [kv for kv in items if _hill_key(kv[0])[0] not in ("C", "H")]
    return tuple(items)


def hill_formula(counts):
    """Hill-notation string for a composition (or for another formula string).

    Isotope pseudo-elements are bracketed -- C2H3[63Cu]N, not C2H363CuN, which
    would read as 363 hydrogens followed by copper.
    """
    out = []
    for s, n in hill_composition(counts):
        sym = "[%s]" % s if _SYMBOL_RE.match(s) and _SYMBOL_RE.match(s).group(1) else s
        out.append("%s%s" % (sym, n if n != 1 else ""))
    return "".join(out)


IonComposition = collections.namedtuple(
    "IonComposition", "composition charge sign formula")
"""composition: (symbol, count) pairs in Hill order -- hashable, so the whole
namedtuple can be used directly as a dictionary key. charge: absolute value.
sign: '+' or '-'. formula: the composition rendered in Hill notation."""


def ion_composition(neutral_formula, adduct):
    """Elemental composition, charge and sign of the ION, or None.

    This is the identity two rows must share to be the same ion. It collapses
    every notational variant that means the same thing:

        [2M+Na-2H]-  ==  [M2+Na-2H]-  ==  [M2+Na-H2]-      (multiplier side,
                                                            term spelling)
        [M-H2O-H]-   ==  [M-H3O]-                          (loss grouping)
        formic acid [2M+Na-2H]-  ==  "sodium formate + formate cluster" [M]-
                                                            (cluster baked into
                                                             the neutral)

    and keeps apart things that merely weigh the same: trifluoroacetate
    (C2F3O2-) and the sodium formate cluster (C2H2NaO4-) are both 112.9856 and
    both return a DIFFERENT composition.

    Isotope-prefixed adduct terms become their own pseudo-elements ('63Cu'), so
    [M+63Cu]+ and [M+65Cu]+ are not merged and neither is confused with [M+Cu]+.

    Returns None -- never a guess -- when the composition cannot be derived: no
    formula, unparsable or absent adduct, an unknown adduct term, or a loss that
    exceeds what the molecule contains (which is a data error, not a notation).
    """
    try:
        n_m, terms, charge, sign = _adduct_terms(adduct)
    except AdductError:
        return None

    counts = {}
    try:
        for el, n in parse_formula(neutral_formula).items():
            counts[el] = counts.get(el, 0) + n * n_m
    except FormulaError:
        return None

    for op, k, token, isotope in terms:
        if isotope is not None:
            sym = "%d%s" % (isotope[1], isotope[0])
            counts[sym] = counts.get(sym, 0) + (k if op == "+" else -k)
            continue
        try:
            sub = parse_formula(ADDUCT_ALIASES.get(token, token))
        except FormulaError:
            return None
        for el, n in sub.items():
            counts[el] = counts.get(el, 0) + (k * n if op == "+" else -(k * n))

    counts = {s: n for s, n in counts.items() if n}
    if not counts or any(n < 0 for n in counts.values()):
        return None
    return IonComposition(hill_composition(counts), charge, sign,
                          hill_formula(counts))


# Preferred spelling for adduct terms, keyed by the term's Hill formula so the
# choice is driven by composition rather than by which shorthand a source
# happened to type. The house style is the one SCHEMA.md already documents:
# condensed structural shorthand for the familiar solvents and counter-ions
# ([M+CH3OH+H]+, [M+HCOO]-, [M+CH3COO]-, [M+TFA-H]-), Hill notation otherwise.
PREFERRED_ADDUCT_TERM = {
    "C2H3N": "CH3CN", "CH4O": "CH3OH", "C2H6O": "C2H5OH", "C3H8O": "C3H7OH",
    "C4H8O": "THF", "C2H4O2": "CH3COOH", "C2H3O2": "CH3COO",
    "CH2O2": "HCOOH", "CHO2": "HCOO",
    "C2HF3O2": "TFA", "C2F3O2": "CF3COO",
    "C2H6OS": "DMSO", "C3H7NO": "DMF",
    "H4N": "NH4", "H3N": "NH3", "ClH": "HCl", "ClNa": "NaCl", "ClK": "KCl",
    "HNaO": "NaOH", "CHNaO2": "HCOONa", "C12H25NaO4S": "SDS",
    "C2H5NO2": "Gly",
}

# Term formulas that are standard adduct vocabulary in their own right, so a
# term may be factored down to one of them (-(H2O)2 -> -2H2O) but no further.
_STANDARD_TERM_FORMULAS = set(PREFERRED_ADDUCT_TERM) | {
    "H2O", "CO2", "CO", "CH4", "O2", "N2", "HF", "H2SO4", "H3PO4", "HNO3",
}


def _term_label(token):
    """(label, multiplicity) for one adduct term's formula.

    A term written as a repeated unit is factored back to that unit so the
    spellings converge: '-H2' is two hydrogens, '-(H2O)2' is two waters, '+Na4'
    is four sodiums. Factoring stops at a single element or at a recognised
    adduct term, so '+C4H8' is not mangled into '+4CH2'.
    """
    counts = parse_formula(ADDUCT_ALIASES.get(token, token))
    g = 0
    for n in counts.values():
        g = math.gcd(g, n)
    for d in sorted((x for x in range(1, g + 1) if g % x == 0), reverse=True):
        prim = {el: n // d for el, n in counts.items()}
        hf = hill_formula(prim)
        if len(prim) == 1 and next(iter(prim.values())) == 1:
            return hf, d                       # a bare element
        if hf in _STANDARD_TERM_FORMULAS:
            return PREFERRED_ADDUCT_TERM.get(hf, hf), d
    hf = hill_formula(counts)
    return PREFERRED_ADDUCT_TERM.get(hf, hf), 1


# Species that carry the charge are written LAST among the additions, which is
# how the field writes [M+CH3OH+H]+, [M+CH3CN+Na]+ and [M+TFA-H]-.
CHARGE_CARRIERS = {
    "H", "Li", "Na", "K", "Rb", "Cs", "Ag", "Cu", "NH4",
    "Cl", "Br", "I", "F", "HCOO", "CH3COO", "CF3COO", "ClO4", "OH",
}


def _term_text(label, count, is_isotope):
    """Render one adduct term. Multiplicity goes in front ('2H', '3Fe') as the
    field writes it, EXCEPT where that prefix would be re-read as a mass number
    -- '+Cl35' must not become '+35Cl', which means the 35-chlorine isotope."""
    if count == 1:
        return label
    if is_isotope:
        return "%s%d" % (label, count)         # isotopes keep a suffix count
    m = _SYMBOL_RE.match(label)
    if m and not m.group(1) and count >= ISOTOPE_PREFIX_MIN and \
            abs(count - round(ELEMENTS[m.group(2)])) <= 3:
        return "%s%d" % (label, count)         # keep the count as a suffix
    return "%d%s" % (count, label)


def canonical_adduct(adduct):
    """Rewrite adduct notation in one house style, or None if unparsable.

    The style, and why it is the one to pick:
      * multiplier BEFORE M ([2M+Na-2H]-, never [M2+Na-2H]-) -- this is what
        every published adduct table uses (Fiehn, METLIN, MS-DIAL, HMDB) and
        what SCHEMA.md already specifies;
      * charge as a bare sign at 1+ ([M+H]+), with the digit only above that
        ([M+2H]2+);
      * additions first, then losses; additions ordered by increasing mass with
        the charge carrier last ([M+CH3CN+Na]+), losses by DECREASING mass so
        water loss precedes deprotonation ([M-H2O-H]-);
      * repeated terms collapsed into a count (+TFA+TFA -> +2TFA), but never
        cancelled across the + and - sides: [M-H2O-H]- keeps its chemistry and
        does not silently become [M-H3O]-;
      * term formulas in Hill notation, except the standard condensed
        shorthands (CH3OH, CH3CN, HCOO, CH3COO, TFA, NH4 ...).

    This is a NOTATIONAL normal form: it never changes what the ion is, so the
    output always re-parses to the same ion_composition() as the input.
    """
    try:
        n_m, terms, charge, sign = _adduct_terms(adduct)
    except AdductError:
        return None

    adds, losses = {}, {}
    for op, k, token, isotope in terms:
        if isotope is not None:
            key = ("%d%s" % (isotope[1], isotope[0]), True)
            mass = ISOTOPE_MASSES[isotope]
            carrier = isotope[0] in CHARGE_CARRIERS
        else:
            try:
                label, mult = _term_label(token)
                mass = monoisotopic_mass(ADDUCT_ALIASES.get(label, label))
            except FormulaError:
                return None
            key = (label, False)
            carrier = label in CHARGE_CARRIERS
            k *= mult
        bucket = adds if op == "+" else losses
        slot = bucket.setdefault(key, [0, mass, carrier])
        slot[0] += k

    body = ""
    for key, (count, mass, carrier) in sorted(
            adds.items(), key=lambda kv: (kv[1][2], kv[1][1], kv[0][0])):
        body += "+" + _term_text(key[0], count, key[1])
    for key, (count, mass, carrier) in sorted(
            losses.items(), key=lambda kv: (-kv[1][1], kv[0][0])):
        body += "-" + _term_text(key[0], count, key[1])

    return "[%sM%s]%s%s" % ("" if n_m == 1 else n_m, body,
                            "" if charge == 1 else charge, sign)


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
