import os
from dotenv import load_dotenv

load_dotenv()

VAULT_PATH = os.path.expanduser(os.environ.get('VAULT_PATH', '~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Tomas'))
FLASK_PORT = int(os.environ.get('FLASK_PORT', 5050))
TASKS_FILE = os.path.join(VAULT_PATH, '_tasks.yaml')
HISTORY_FILE = os.path.join(VAULT_PATH, '_tasks-history.md')
CACHE_TTL = 30  # seconds before re-scanning vault files
