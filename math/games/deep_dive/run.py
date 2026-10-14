"""Official create_books / generate_configs workflow; deliberately tiny."""
from game_config import GameConfig
from gamestate import GameState
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":
    config = GameConfig()
    state = GameState(config)
    create_books(state, config, {"base": 100}, 100, 1, True, False)
    generate_configs(state)
