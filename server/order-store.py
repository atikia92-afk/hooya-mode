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
CREATE TABLE IF NOT EXISTS order_notifications (
 order_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0, lease TEXT, delivered_at INTEGER,
 last_error TEXT, message_id TEXT, PRIMARY KEY(order_id,channel)
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
        inserted = db.execute('INSERT INTO orders VALUES (?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING',
                   (order['id'], data['key'], data['hash'], order['billing']['phone'], order['createdAt'], 1, json.dumps(order, ensure_ascii=False)))
        if inserted.rowcount:
            for channel in data.get('channels', []):
                if channel in ('telegram', 'bale'):
                    db.execute('INSERT OR IGNORE INTO order_notifications(order_id,channel) VALUES (?,?)', (order['id'], channel))
        row = db.execute('SELECT id,payload_hash,body FROM orders WHERE request_key=?', (data['key'],)).fetchone()
        result = {'hash': row['payload_hash'], 'order': json.loads(row['body'])}
    elif op == 'previous':
        row = db.execute('SELECT payload_hash,body FROM orders WHERE request_key=?', (data['key'],)).fetchone()
        result = {'hash': row['payload_hash'], 'order': json.loads(row['body'])} if row else None
    elif op == 'notification_claim':
        db.execute('BEGIN IMMEDIATE')
        channels = [channel for channel in data['channels'] if channel in ('telegram', 'bale')]
        row = db.execute("SELECT n.order_id,n.channel,n.attempts,o.body FROM order_notifications n JOIN orders o ON o.id=n.order_id WHERE n.status='pending' AND n.next_at<=? AND n.locked_until<=? AND n.channel IN (" + ','.join('?' for _ in channels) + ") ORDER BY o.created_at,n.channel LIMIT 1", (data['now'], data['now'], *channels)).fetchone() if channels else None
        if row:
            db.execute('UPDATE order_notifications SET attempts=attempts+1,locked_until=?,lease=? WHERE order_id=? AND channel=?', (data['now']+60000, data['lease'], row['order_id'], row['channel']))
            result = {'channel': row['channel'], 'attempts': row['attempts']+1, 'order': json.loads(row['body'])}
    elif op == 'notification_finish':
        if data.get('deliveredAt') is not None:
            db.execute("UPDATE order_notifications SET status='delivered',delivered_at=?,message_id=?,last_error=NULL,locked_until=0 WHERE order_id=? AND channel=? AND lease=?", (data['deliveredAt'], data.get('messageId', ''), data['orderId'], data['channel'], data['lease']))
        else:
            db.execute('UPDATE order_notifications SET status=?,last_error=?,next_at=?,locked_until=0 WHERE order_id=? AND channel=? AND lease=?', ('failed' if data.get('failed') else 'pending', data['error'][:200], data['nextAt'], data['orderId'], data['channel'], data['lease']))
        result = True
    elif op == 'notification_status':
        result = {}
        for channel in ('telegram', 'bale'):
            counts = db.execute('SELECT status,COUNT(*) AS total FROM order_notifications WHERE channel=? GROUP BY status', (channel,)).fetchall()
            latest = db.execute('SELECT delivered_at,last_error FROM order_notifications WHERE channel=? ORDER BY COALESCE(delivered_at, next_at) DESC LIMIT 1', (channel,)).fetchone()
            result[channel] = {'counts': {row['status']: row['total'] for row in counts}, 'lastDeliveredAt': latest['delivered_at'] if latest else None, 'lastError': latest['last_error'] if latest else None}
    elif op == 'notification_retry':
        changed = db.execute("UPDATE order_notifications SET status='pending',attempts=0,next_at=0,locked_until=0,lease=NULL WHERE channel=? AND status='failed'", (data['channel'],))
        result = {'retried': changed.rowcount}
    elif op == 'get':
        row = db.execute('SELECT body FROM orders WHERE id=?', (data['id'],)).fetchone()
        result = json.loads(row['body']) if row else None
    elif op == 'counts':
        rows = db.execute("SELECT json_extract(body,'$.status') AS status,COUNT(*) AS total,SUM(CASE WHEN json_extract(body,'$.seenAt') IS NULL THEN 1 ELSE 0 END) AS unread FROM orders GROUP BY json_extract(body,'$.status')").fetchall()
        result = {'counts': {row['status']: row['total'] for row in rows}, 'unread': sum(row['unread'] for row in rows)}
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
