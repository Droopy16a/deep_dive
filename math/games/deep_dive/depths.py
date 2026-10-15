"""Depths are official bet modes with their own authoritative lookup weights."""
from copy import deepcopy
from distribution import build_outcomes, build_catalogue


def build_depth_models(settings):
    base = build_outcomes(settings)
    base_total = sum(row["weight"] for row in base)
    positive_weight = sum(row["weight"] for row in base if row["multiplier"] > 0)
    depths = settings.get("depths", [100, 300, 600])
    if depths != [100, 300, 600]:
        raise ValueError("Depths must be Easy 100m, Medium 300m and Hard 600m")
    models = {}
    for depth in depths:
        bonus = depth // 100
        mode = "base" if depth == 100 else f"depth_{depth}"
        outcomes = deepcopy(base)
        for row in outcomes:
            row["multiplier"] *= bonus
            if row["multiplier"] == 0:
                row["weight"] = base_total * bonus - positive_weight
        explicit = {**settings, "outcomes": outcomes, "maxWin": settings["maxWin"] * bonus}
        explicit.pop("distribution", None)
        models[mode] = {"mode": mode, "depth": depth, "landingBonus": bonus,
                        "cost": settings["cost"], "rtp": settings["prototypeRtp"],
                        "maxWin": explicit["maxWin"], "winProbability": positive_weight / (base_total * bonus),
                        "outcomes": outcomes, "catalogue": build_catalogue(explicit)}
    return models
