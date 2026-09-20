import hashlib
import json
import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('BEE_DB_PATH', ROOT / 'bee_pos.db'))
TABLES = ('categories', 'products', 'orders', 'order_items', 'settlements')


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier():
    return str(uuid.uuid4())


@contextmanager
def database():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA synchronous=FULL')
    try:
        with con:
            yield con
    finally:
        con.close()


def initialize(seed_menu=True):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as con:
        con.executescript((ROOT / 'schema.sql').read_text(encoding='utf-8'))
        con.execute('BEGIN IMMEDIATE')
        columns = {r['name'] for r in con.execute('PRAGMA table_info(orders)')}
        if 'request_id' not in columns:
            con.execute('ALTER TABLE orders ADD COLUMN request_id TEXT')
            con.execute('UPDATE orders SET request_id=id')
        if 'updated_at' not in columns:
            con.execute('ALTER TABLE orders ADD COLUMN updated_at TEXT')
            con.execute('UPDATE orders SET updated_at=created_at')
        con.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_request ON orders(request_id)')
    if seed_menu:
        from menu_loader import initialize_menu
        initialize_menu()


def setup_logging(name):
    logging.basicConfig(filename=ROOT / f'{name}.log', encoding='utf-8',
                        level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    audit = logging.getLogger('operations')
    audit.propagate = False
    audit.setLevel(logging.INFO)
    if not audit.handlers:
        handler = logging.FileHandler(ROOT / 'operations.txt', encoding='utf-8')
        handler.setFormatter(logging.Formatter('%(message)s'))
        audit.addHandler(handler)


def audit(action, entity_id):
    logging.getLogger('operations').info('%s %s %s', now(), action, entity_id)


def dirty(con, table, key):
    con.execute('INSERT INTO sync_state VALUES (?,?,?,1,NULL) '
                'ON CONFLICT(entity,entity_id) DO UPDATE SET version=excluded.version,dirty=1,synced_at=NULL',
                (table, key, identifier()))


def text(value, name, limit=200):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{name}格式不正確')
    return value.strip()


def number(value, name, minimum=0, maximum=999999):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f'{name}必須是 {minimum} 到 {maximum} 的整數')
    return value


def products():
    with database() as con:
        return [dict(r, is_active=bool(r['is_active']), is_favorite=bool(r['is_favorite'])) for r in
                con.execute('SELECT p.id,p.name,c.name category,p.price,p.is_active,p.is_favorite '
                            'FROM products p JOIN categories c ON c.id=p.category_id WHERE p.deleted=0 ORDER BY p.rowid')]


def save_product(data, key=None):
    name = text(data.get('name'), '商品名稱')
    category = text(data.get('category'), '分類')
    price = number(data.get('price'), '單價')
    for flag in ('is_active', 'is_favorite'):
        if type(data.get(flag)) is not bool:
            raise ValueError('商品狀態必須是布林值')
    with database() as con:
        con.execute('BEGIN IMMEDIATE')
        if key and not con.execute('SELECT id FROM products WHERE id=? AND deleted=0', (key,)).fetchone():
            raise LookupError('找不到商品')
        key = key or identifier()
        category_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'bee-category:' + category))
        if not con.execute('SELECT id FROM categories WHERE id=?', (category_id,)).fetchone():
            con.execute('INSERT INTO categories VALUES (?,?)', (category_id, category))
            dirty(con, 'categories', category_id)
        con.execute('INSERT INTO products VALUES (?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET '
                    'category_id=excluded.category_id,name=excluded.name,price=excluded.price,'
                    'is_active=excluded.is_active,is_favorite=excluded.is_favorite',
                    (key, category_id, name, price, data['is_active'], data['is_favorite']))
        dirty(con, 'products', key)
    audit('儲存商品', key)
    return products()


def delete_product(key):
    with database() as con:
        if con.execute('UPDATE products SET deleted=1,is_active=0 WHERE id=? AND deleted=0', (key,)).rowcount != 1:
            raise LookupError('找不到商品')
        dirty(con, 'products', key)
    audit('刪除商品', key)
    return products()


def orders(key=None):
    with database() as con:
        result = []
        query = 'SELECT o.*,s.dirty,s.synced_at FROM orders o JOIN sync_state s ON s.entity=\'orders\' AND s.entity_id=o.id'
        for row in con.execute(query + (' WHERE o.id=?' if key else '') + ' ORDER BY o.created_at DESC', (key,) if key else ()):
            order = dict(row)
            order.pop('request_hash')
            order.pop('request_id', None)
            order['items'] = [dict(i, subtotal=i['unit_price'] * i['quantity']) for i in
                              con.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY id', (row['id'],))]
            order['total_amount'] = sum(i['subtotal'] for i in order['items'])
            order['change_amount'] = row['received_amount'] - order['total_amount']
            order['order_no'] = '#' + (row['id'] if len(row['id']) == 22 else order_timestamp(row['created_at']))
            order['sync_status'] = 'pending' if order.pop('dirty') else 'synced'
            result.append(order)
        return result


def order_timestamp(value):
    return datetime.fromisoformat(value).astimezone(timezone(timedelta(hours=8))).strftime('%Y%m%d-%H%M%S-%f')


def checkout(data):
    request_id = text(data.get('id'), '交易識別碼', 36)
    try:
        if str(uuid.UUID(request_id)) != request_id:
            raise ValueError()
    except ValueError:
        raise ValueError('交易識別碼必須為 UUID')
    received = number(data.get('received_amount'), '實收金額')
    items = data.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError('訂單必須包含 1 到 100 個品項')
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    with database() as con:
        con.execute('BEGIN IMMEDIATE')
        existing = con.execute('SELECT id,request_hash FROM orders WHERE request_id=?', (request_id,)).fetchone()
        if existing:
            key = existing['id']
            if existing['request_hash'] != digest:
                raise ValueError('相同交易識別碼的內容不可不同，請先查閱訂單')
        else:
            timestamp = now()
            key = order_timestamp(timestamp)
            # 由 SQLite 寫入鎖序列化分配；同一微秒的交易以微秒遞增避免撞號。
            while con.execute('SELECT 1 FROM orders WHERE id=?', (key,)).fetchone():
                timestamp = (datetime.fromisoformat(timestamp) + timedelta(microseconds=1)).isoformat()
                key = order_timestamp(timestamp)
            lines = []
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError('品項格式不正確')
                quantity = number(item.get('quantity'), '數量', 1, 999)
                product_id = item.get('product_id')
                if product_id:
                    product_id = text(product_id, '商品識別碼', 36)
                    product = con.execute('SELECT * FROM products WHERE id=? AND deleted=0 AND is_active=1', (product_id,)).fetchone()
                    if not product:
                        raise ValueError('商品不存在或已停售，請重新整理菜單')
                    name, price = product['name'], product['price']
                    if item.get('unit_price') != price:
                        raise ValueError('商品價格已變更，請重新整理後重新點餐')
                else:
                    name = text(item.get('product_name'), '自訂品項名稱')
                    price = number(item.get('unit_price'), '自訂品項單價')
                lines.append((identifier(), key, product_id or None, name, price, quantity))
            total = sum(line[4] * line[5] for line in lines)
            if received < total:
                raise ValueError('實收金額不足')
            con.execute('INSERT INTO orders (id,created_at,received_amount,status,note,request_hash,request_id,updated_at) '
                        'VALUES (?,?,?,?,?,?,?,?)', (key, timestamp, received, 'completed', '', digest, request_id, timestamp))
            con.executemany('INSERT INTO order_items VALUES (?,?,?,?,?,?)', lines)
            dirty(con, 'orders', key)
            for line in lines:
                dirty(con, 'order_items', line[0])
    audit('現金結帳', key)
    return dict(orders(key)[0], warning='HARDWARE_OFFLINE')


def update_order(key, data):
    if data.get('status') not in ('completed', 'cancelled'):
        raise ValueError('訂單狀態不正確')
    note = data.get('note', '')
    if not isinstance(note, str) or len(note) > 1000:
        raise ValueError('備註過長或格式不正確')
    with database() as con:
        if con.execute('UPDATE orders SET status=?,note=?,updated_at=? WHERE id=?', (data['status'], note, now(), key)).rowcount != 1:
            raise LookupError('找不到訂單')
        dirty(con, 'orders', key)
    audit('更新訂單狀態', key)
    return orders()


def save_settlement(data):
    cash = number(data.get('cash_actual'), '盤點現金', 0, 999999999)
    note = data.get('notes', '')
    if not isinstance(note, str) or len(note) > 1000:
        raise ValueError('備註格式不正確')
    key = text(data.get('id'), '日結識別碼', 36)
    date = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    timestamp = now()
    with database() as con:
        con.execute('INSERT INTO settlements VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING', (key, date, cash, note, timestamp))
        dirty(con, 'settlements', key)
        row = dict(con.execute('SELECT * FROM settlements WHERE id=?', (key,)).fetchone())
        total, count = con.execute("SELECT COALESCE(SUM(i.unit_price*i.quantity),0),COUNT(DISTINCT o.id) "
                                   "FROM orders o JOIN order_items i ON i.order_id=o.id "
                                   "WHERE o.status='completed' AND date(o.created_at,'+8 hours')=?", (row['date'],)).fetchone()
    audit('儲存日結盤點', key)
    return dict(row, total_sales=total, order_count=count, cash_expected=total, discrepancy=row['cash_actual']-total)
