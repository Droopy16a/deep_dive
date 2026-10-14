"""Independent integer-weight payout model; book count controls route variety only."""
from fractions import Fraction
import random
import math
from collections import Counter


def build_outcomes(settings):
    """Discretize m(u) = -scale * ln(1-u), then calibrate cents exactly.

    A separate zero mass and rare cap are explicit, not part of the log curve.
    Adjacent-cent splitting removes quantization error without changing RTP.
    """
    model = settings.get("distribution")
    if model is None:
        return settings["outcomes"]
    if model["type"] != "logarithmic":
        raise ValueError("Unknown distribution type")
    count, total, zero, cap_weight = (model[key] for key in ("quantiles", "totalWeight", "zeroWeight", "maxWinWeight"))
    if not all(type(n) is int for n in (count, total, zero, cap_weight)) or count < 2 or total > 2**32 or zero < 1 or cap_weight < 1:
        raise ValueError("Invalid logarithmic distribution parameters")
    cap = int(Fraction(str(settings["maxWin"])) * 100)
    target = Fraction(str(settings["prototypeRtp"])) * total * 100 - cap * cap_weight
    remaining = total - zero - cap_weight
    if remaining < count or target.denominator != 1 or not remaining <= target < remaining * (cap - 1):
        raise ValueError("RTP cannot be represented with these weights and cap")
    weights = [remaining // count + (i < remaining % count) for i in range(count)]
    curve = [-math.log1p(-(i + .5) / count) for i in range(count)]

    def values(scale):
        return [min(cap - 1, max(1, math.floor(scale * point))) for point in curve]

    low, high = 0., float(target)
    for _ in range(100):
        mid = (low + high) / 2
        if sum(p * w for p, w in zip(values(mid), weights)) <= target:
            low = mid
        else:
            high = mid
    payouts = values(low)
    residual = int(target) - sum(p * w for p, w in zip(payouts, weights))
    frequencies = Counter({0: zero, cap: cap_weight})
    for payout, weight in zip(payouts, weights):
        # Split probability mass across adjacent cents; no final event override.
        incremented = min(residual, weight) if payout < cap - 1 else 0
        frequencies[payout] += weight - incremented
        frequencies[payout + 1] += incremented
        residual -= incremented
    if residual:
        raise ValueError("Could not calibrate logarithmic model to exact RTP")
    return [dict(multiplier=payout, weight=weight, books=model["zeroBooks"] if payout == 0 else 1)
            for payout, weight in sorted(frequencies.items()) if weight]


def build_catalogue(settings):
    catalogue = []
    for entry in build_outcomes(settings):
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
