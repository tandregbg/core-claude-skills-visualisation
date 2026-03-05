import os
import json
from dotenv import load_dotenv

load_dotenv()

VAULT_PATH = os.path.expanduser(os.environ.get('VAULT_PATH', '~/Documents/vault'))
VAULT_NAME = os.environ.get('VAULT_NAME', os.path.basename(VAULT_PATH))
FLASK_PORT = int(os.environ.get('FLASK_PORT', 5050))
TASKS_FILE = os.path.join(VAULT_PATH, '_tasks.yaml')
HISTORY_FILE = os.path.join(VAULT_PATH, '_tasks-history.md')
CACHE_TTL = 30  # seconds before re-scanning vault files

# Settings file lives next to app.py (gitignored)
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'settings.json')

_SETTINGS_DEFAULTS = {
    'vault_path': VAULT_PATH,
    'vault_name': VAULT_NAME,
    'scan_depth': 2,
    'projects': {},
    'llm': {
        'provider': 'ollama',
        'ollama_endpoint': 'http://192.168.11.169:11434',
        'ollama_model': 'qwen3:30b',
        'anthropic_api_key': '',
        'anthropic_model': 'claude-sonnet-4-20250514',
        'openai_api_key': '',
        'openai_model': 'gpt-4o',
        'timeout': 600,
    },
}

SYNTHESIS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'syntheses')


def load_settings():
    """Read settings.json, creating it from defaults + .env if missing."""
    if os.path.isfile(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Ensure all default keys exist
        for key, val in _SETTINGS_DEFAULTS.items():
            data.setdefault(key, val)
        return data
    # First run -- seed from .env defaults
    settings = dict(_SETTINGS_DEFAULTS)
    save_settings(settings)
    return settings


def save_settings(settings):
    """Persist settings dict to settings.json."""
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write('\n')
