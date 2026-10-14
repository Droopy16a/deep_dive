"""Adapted from the official games/fifty_fifty/game_config.py."""
import json
import os
import random
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
        self.wincap = settings["maxWin"]
        self.payout_catalogue = [entry["multiplier"] for entry in settings["outcomes"] for _ in range(entry["books"])]
        random.Random(42).shuffle(self.payout_catalogue)
        assert len(self.payout_catalogue) == 100
        assert max(self.payout_catalogue) / 100 == self.wincap
        assert sum(self.payout_catalogue) / len(self.payout_catalogue) / 100 == self.rtp
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
            name=settings["mode"], cost=settings["cost"], rtp=self.rtp,
            max_win=self.wincap, auto_close_disabled=False,
            is_feature=True, is_buybonus=False,
            distributions=[Distribution(criteria="basegame", quota=1.0, conditions={
                "reel_weights": {}, "force_wincap": False, "force_freegame": False,
            })],
        )]
