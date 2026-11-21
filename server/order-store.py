"""Private SQLite adapter. JSON travels on stdin/stdout, never process arguments."""
import json, os, sqlite3, sys

os.umask(0o077)
db_path = sys.argv[1]
os.makedirs(os.path.dirname(os.path.abspath(db_path)), mode=0o700, exist_ok=True)
db = sqlite3.connect(db_path, timeout=5)
db.row_factory = sqlite3.Row
db.execute('PRAGMA journal_mode=WAL')
db.execute('PRAGMA busy_timeout=5000')
db.executescript('''
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL,
 phone TEXT NOT NULL, created_at TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone, created_at DESC);
CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otp (
 id TEXT PRIMARY KEY, phone TEXT NOT NULL, hash TEXT NOT NULL, browser TEXT NOT NULL,
 expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
''')
data = json.load(sys.stdin)
op = data['op']
result = None
with db:
    if op == 'health':
        result = {'available': True}
    elif op == 'create':
        order = data['order']
        db.execute('INSERT INTO orders VALUES (?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING',
                   (order['id'], data['key'], data['hash'], order['billing']['phone'], order['createdAt'], 1, json.dumps(order, ensure_ascii=False)))
        row = db.execute('SELECT id,payload_hash,body FROM orders WHERE request_key=?', (data['key'],)).fetchone()
        result = {'hash': row['payload_hash'], 'order': json.loads(row['body'])}
    elif op == 'previous':
        row = db.execute('SELECT payload_hash,body FROM orders WHERE request_key=?', (data['key'],)).fetchone()
        result = {'hash': row['payload_hash'], 'order': json.loads(row['body'])} if row else None
    elif op == 'get':
        row = db.execute('SELECT body FROM orders WHERE id=?', (data['id'],)).fetchone()
        result = json.loads(row['body']) if row else None
    elif op == 'list':
        if data.get('phone'):
            rows = db.execute('SELECT body FROM orders WHERE phone=? ORDER BY created_at DESC LIMIT 200', (data['phone'],)).fetchall()
        else:
            rows = db.execute('SELECT body FROM orders ORDER BY created_at DESC LIMIT 500').fetchall()
        result = [json.loads(row['body']) for row in rows]
    elif op == 'update':
        order = data['order']
        updated = db.execute('UPDATE orders SET version=?,body=? WHERE id=? AND version=?',
                             (order['version'], json.dumps(order, ensure_ascii=False), order['id'], data['version']))
        result = {'updated': updated.rowcount == 1}
    elif op == 'rate':
        db.execute('DELETE FROM rates WHERE expires < ?', (data['now'],))
        row = db.execute('INSERT INTO rates VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
                         (data['key'], data['expires'])).fetchone()
        result = row['count']
    elif op == 'otp_start':
        db.execute('DELETE FROM otp WHERE expires < ? OR phone=?', (data['now'], data['phone']))
        db.execute('INSERT INTO otp(id,phone,hash,browser,expires) VALUES (?,?,?,?,?)',
                   (data['id'], data['phone'], data['hash'], data['browser'], data['expires']))
        result = True
    elif op == 'otp_delete':
        db.execute('DELETE FROM otp WHERE id=?', (data['id'],))
        result = True
    elif op == 'otp_verify':
        # Lock before the read: concurrent verifications cannot consume the code twice.
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM otp WHERE id=?', (data['id'],)).fetchone()
        if row and row['expires'] >= data['now'] and row['attempts'] < 5 and row['browser'] == data['browser']:
            db.execute('UPDATE otp SET attempts=attempts+1 WHERE id=?', (data['id'],))
            import hmac
            if hmac.compare_digest(row['hash'], data['hash']):
                result = row['phone']
                db.execute('DELETE FROM otp WHERE id=?', (data['id'],))
    elif op == 'import':
        count = 0
        for order in data['orders']:
            cursor = db.execute('INSERT INTO orders VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
                                (order['id'], order['requestKey'], order['payloadHash'], order['billing']['phone'], order['createdAt'], order['version'], json.dumps(order, ensure_ascii=False)))
            count += cursor.rowcount
        result = {'imported': count}
    else:
        raise ValueError('Unsupported operation')
print(json.dumps(result, ensure_ascii=False))
