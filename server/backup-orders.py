"""Consistent SQLite backup without opening customer records in logs."""
import datetime, os, pathlib, sqlite3
os.umask(0o077)
state = pathlib.Path('/var/lib/hooya-orders')
source = state / 'orders.sqlite3'
if source.is_file():
    folder = state / 'backups'
    folder.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    with sqlite3.connect(source) as original, sqlite3.connect(folder / (stamp + '.sqlite3')) as destination:
        original.backup(destination)
