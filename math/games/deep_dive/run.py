"""Official create_books / generate_configs workflow; deliberately tiny."""
import csv
import shutil
from pathlib import Path
from game_config import GameConfig
from gamestate import GameState
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":
    config = GameConfig()
    state = GameState(config)
    create_books(state, config, {mode: len(model["catalogue"]) for mode, model in config.depth_models.items()}, 100, 1, True, False)
    # Set final weights before SDK config/hash generation for every bet mode.
    for mode, model in config.depth_models.items():
        lookup = Path(state.output_files.lookups[mode]["paths"]["base_lookup"])
        with lookup.open(newline="") as source:
            rows = list(csv.reader(source))
        with lookup.open("w", newline="") as target:
            writer = csv.writer(target)
            for sim_id, _, payout in rows:
                writer.writerow([sim_id, model["catalogue"][int(sim_id)][1], payout])
        shutil.copy2(lookup, state.output_files.lookups[mode]["paths"]["optimized_lookup"])
    generate_configs(state)
