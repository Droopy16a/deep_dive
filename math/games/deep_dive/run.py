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
    create_books(state, config, {"base": len(config.payout_catalogue)}, 100, 1, True, False)
    # Use SDK-supported lookup weights before generating configs and their hashes.
    lookup = Path(state.output_files.lookups["base"]["paths"]["base_lookup"])
    with lookup.open(newline="") as source:
        rows = list(csv.reader(source))
    with lookup.open("w", newline="") as target:
        writer = csv.writer(target)
        for sim_id, _, payout in rows:
            writer.writerow([sim_id, config.selection_weights[int(sim_id)], payout])
    shutil.copy2(lookup, state.output_files.lookups["base"]["paths"]["optimized_lookup"])
    generate_configs(state)
