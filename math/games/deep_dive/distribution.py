"""Independent integer-weight payout model; book count controls route variety only."""
from fractions import Fraction
import random


def build_catalogue(settings):
    catalogue = []
    for entry in settings["outcomes"]:
        payout, count, weight = entry["multiplier"], entry["books"], entry["weight"]
        if not all(type(n) is int for n in (payout, count, weight)) or payout < 0 or count < 1 or weight < count:
            raise ValueError("Each outcome needs integer payout >= 0, books >= 1 and weight >= books")
        share, remainder = divmod(weight, count)
        catalogue.extend((payout, share + (i < remainder)) for i in range(count))
    if not catalogue:
        raise ValueError("At least one outcome is required")
    total = sum(weight for _, weight in catalogue)
    if total > 2**32:
        raise ValueError("Demo weight total must fit a uint32 draw")
    if Fraction(sum(payout * weight for payout, weight in catalogue), total * 100) != Fraction(str(settings["prototypeRtp"])):
        raise ValueError("Configured RTP does not equal the exact weighted return")
    if Fraction(max(payout for payout, _ in catalogue), 100) != Fraction(str(settings["maxWin"])):
        raise ValueError("Configured maxWin does not match the highest payout")
    random.Random(42).shuffle(catalogue)
    return catalogue
