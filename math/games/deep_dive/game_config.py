"""Adapted from the official games/fifty_fifty/game_config.py."""
import json
import os
from depths import build_depth_models
from pathlib import Path

from src.config.config import Config, BetMode
from src.config.distributions import Distribution


class GameConfig(Config):
    def __init__(self):
        super().__init__()
        settings = json.loads(Path(os.environ["DEEP_DIVE_CONFIG"]).read_text(encoding="utf-8"))
        self.game_id = settings["id"]
        self.provider_name = settings["provider"]
        self.provider_number = settings["providerNumber"]  # Replace with assigned provider number.
        self.game_name = settings["name"]
        self.working_name = self.game_id
        self.rtp = settings["prototypeRtp"]
        self.depth_models = build_depth_models(settings)
        self.wincap = max(model["maxWin"] for model in self.depth_models.values())
        self.win_type = "other"
        self.construct_paths()
        self.num_reels = 0
        self.num_rows = []
        self.paytable = {}
        self.include_padding = False
        self.special_symbols = {"wild": [], "scatter": [], "multiplier": []}
        self.freespin_triggers = {self.basegame_type: {}, self.freegame_type: {}}
        self.anticipation_triggers = {self.basegame_type: 0, self.freegame_type: 0}
        self.bet_modes = [BetMode(
            name=model["mode"], cost=model["cost"], rtp=model["rtp"],
            max_win=model["maxWin"], auto_close_disabled=False,
            is_feature=True, is_buybonus=False,
            distributions=[Distribution(criteria="basegame", quota=1.0, conditions={
                "reel_weights": {}, "force_wincap": False, "force_freegame": False,
            })],
        ) for model in self.depth_models.values()]
