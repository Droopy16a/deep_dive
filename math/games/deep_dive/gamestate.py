"""Payout-first game books with exact collectible/mine routes to the seabed.

RGS selects precomputed books by lookup weight; the frontend only plays events.
"""
from src.executables.executables import Executables
from route import generate_route


class GameState(Executables):
    def assign_special_sym_function(self):
        pass

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim, simulation_seed)
        self.reset_book()
        # The payout is fixed BEFORE any route search or visual path generation.
        model = self.config.depth_models[self.betmode]
        target, _ = model["catalogue"][sim % len(model["catalogue"]) ]
        payout = target / 100
        for event in generate_route(target, sim + model["depth"] * 10000, model["depth"], model["landingBonus"]):
            self.book.add_event({"index": len(self.book.events), **event})
        self.win_manager.update_spinwin(payout)
        self.win_manager.update_gametype_wins(self.gametype)
        self.evaluate_finalwin()  # Official SDK finalWin + payoutMultiplier.
        self.imprint_wins()

    def run_freespin(self):
        pass
