import hashlib
import json
import logging
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("BEE_DB_PATH", ROOT / "bee_pos.db"))
TABLES = ("categories", "products", "orders", "order_items", "settlements")
SCHEMA_VERSION = 2


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier():
    """建立僅供 API 重送去重使用的 UUID，不作為資料表主鍵。"""
    return str(uuid.uuid4())


@contextmanager
def database():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    try:
        with con:
            yield con
    finally:
        con.close()


def _schema_statements():
    statement = ""
    for line in (ROOT / "schema.sql").read_text(encoding="utf-8").splitlines():
        if line.lstrip().upper().startswith("PRAGMA"):
            continue
        statement += line + "\n"
        if sqlite3.complete_statement(statement):
            if statement.strip():
                yield statement
            statement = ""


def _needs_integer_migration(con):
    tables = {
        row[0]
        for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    if not tables:
        return False
    expected = {
        "categories",
        "products",
        "orders",
        "order_items",
        "settlements",
        "sync_state",
        "sync_logs",
        "initialization_state",
    }
    if not expected.issubset(tables):
        return True
    for table in TABLES + ("sync_logs",):
        columns = {row[1]: row[2].upper() for row in con.execute(f"PRAGMA table_info({table})")}
        if columns.get("id") != "INTEGER":
            return True
    sync_columns = {
        row[1]: row[2].upper() for row in con.execute("PRAGMA table_info(sync_state)")
    }
    return sync_columns.get("entity_id") != "INTEGER" or sync_columns.get("version") != "INTEGER"


def _allocate_ids(rows, preferred=None):
    mapping = {}
    used = set()
    deferred = []
    for row in rows:
        old_id = row["id"]
        candidate = preferred(old_id) if preferred else old_id if type(old_id) is int else None
        if type(candidate) is int and candidate > 0 and candidate not in used:
            mapping[old_id] = candidate
            used.add(candidate)
        else:
            deferred.append(old_id)
    next_id = 1
    for old_id in deferred:
        while next_id in used:
            next_id += 1
        mapping[old_id] = next_id
        used.add(next_id)
    return mapping


def _migrate_to_integer_ids():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=OFF")
    try:
        con.execute("BEGIN IMMEDIATE")
        existing = {
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        legacy = {}
        for table in (
            "order_items",
            "products",
            "categories",
            "orders",
            "settlements",
            "sync_state",
            "sync_logs",
            "initialization_state",
        ):
            if table in existing:
                legacy_name = f"_legacy_{table}"
                if legacy_name in existing:
                    raise RuntimeError(f"偵測到未完成的資料庫遷移：{legacy_name}")
                con.execute(f"ALTER TABLE {table} RENAME TO {legacy_name}")
                legacy[table] = legacy_name
        for statement in _schema_statements():
            con.execute(statement)

        def rows(table):
            if table not in legacy:
                return []
            return list(con.execute(f"SELECT rowid AS _rowid,* FROM {legacy[table]} ORDER BY rowid"))

        category_rows = rows("categories")
        product_rows = rows("products")
        order_rows = rows("orders")
        item_rows = rows("order_items")
        settlement_rows = rows("settlements")
        category_ids = _allocate_ids(category_rows)

        def product_preference(old_id):
            if type(old_id) is int:
                return old_id
            match = re.fullmatch(r"p(\d+)", str(old_id))
            return int(match.group(1)) if match else None

        product_ids = _allocate_ids(product_rows, product_preference)
        order_ids = _allocate_ids(order_rows)
        item_ids = _allocate_ids(item_rows)
        settlement_ids = _allocate_ids(settlement_rows)
        id_maps = {
            "categories": category_ids,
            "products": product_ids,
            "orders": order_ids,
            "order_items": item_ids,
            "settlements": settlement_ids,
        }

        for row in category_rows:
            con.execute(
                "INSERT INTO categories (id,name) VALUES (?,?)",
                (category_ids[row["id"]], row["name"]),
            )
        for row in product_rows:
            con.execute(
                "INSERT INTO products (id,category_id,name,price,is_active,is_favorite,deleted) VALUES (?,?,?,?,?,?,?)",
                (
                    product_ids[row["id"]],
                    category_ids[row["category_id"]],
                    row["name"],
                    row["price"],
                    row["is_active"],
                    row["is_favorite"],
                    row["deleted"],
                ),
            )
        order_columns = {row[1] for row in con.execute(f"PRAGMA table_info({legacy['orders']})")} if "orders" in legacy else set()
        for row in order_rows:
            request_id = row["request_id"] if "request_id" in order_columns and row["request_id"] else str(row["id"])
            updated_at = row["updated_at"] if "updated_at" in order_columns and row["updated_at"] else row["created_at"]
            con.execute(
                "INSERT INTO orders (id,created_at,received_amount,status,note,request_hash,request_id,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (
                    order_ids[row["id"]],
                    row["created_at"],
                    row["received_amount"],
                    row["status"],
                    row["note"],
                    row["request_hash"],
                    request_id,
                    updated_at,
                ),
            )
        for row in item_rows:
            con.execute(
                "INSERT INTO order_items (id,order_id,product_id,product_name,unit_price,quantity) VALUES (?,?,?,?,?,?)",
                (
                    item_ids[row["id"]],
                    order_ids[row["order_id"]],
                    product_ids.get(row["product_id"]) if row["product_id"] is not None else None,
                    row["product_name"],
                    row["unit_price"],
                    row["quantity"],
                ),
            )
        settlement_columns = {row[1] for row in con.execute(f"PRAGMA table_info({legacy['settlements']})")} if "settlements" in legacy else set()
        for row in settlement_rows:
            request_id = row["request_id"] if "request_id" in settlement_columns and row["request_id"] else str(row["id"])
            con.execute(
                "INSERT INTO settlements (id,request_id,date,cash_actual,notes,created_at) VALUES (?,?,?,?,?,?)",
                (
                    settlement_ids[row["id"]],
                    request_id,
                    row["date"],
                    row["cash_actual"],
                    row["notes"],
                    row["created_at"],
                ),
            )
        for table, mapping in id_maps.items():
            for new_id in mapping.values():
                con.execute(
                    "INSERT INTO sync_state (entity,entity_id,version,dirty,synced_at) VALUES (?,?,1,1,NULL)",
                    (table, new_id),
                )
        for row in rows("sync_logs"):
            con.execute(
                "INSERT INTO sync_logs (timestamp,orders_synced,status,message) VALUES (?,?,?,?)",
                (row["timestamp"], row["orders_synced"], row["status"], row["message"]),
            )
        for row in rows("initialization_state"):
            con.execute(
                "INSERT OR REPLACE INTO initialization_state (name,completed_at) VALUES (?,?)",
                (row["name"], row["completed_at"]),
            )
        for table in legacy.values():
            con.execute(f"DROP TABLE {table}")
        con.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        violations = con.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"資料庫遷移後外鍵檢查失敗：{violations[:3]}")
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def initialize(seed_menu=True):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    probe = sqlite3.connect(DB_PATH, timeout=10)
    try:
        migrate = _needs_integer_migration(probe)
    finally:
        probe.close()
    if migrate:
        _migrate_to_integer_ids()
    with database() as con:
        con.executescript((ROOT / "schema.sql").read_text(encoding="utf-8"))
    if seed_menu:
        from menu_loader import initialize_menu

        initialize_menu()


def setup_logging(name):
    logging.basicConfig(
        filename=ROOT / f"{name}.log",
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    operations = logging.getLogger("operations")
    operations.propagate = False
    operations.setLevel(logging.INFO)
    if not operations.handlers:
        handler = logging.FileHandler(ROOT / "operations.txt", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(message)s"))
        operations.addHandler(handler)


def audit(action, entity_id):
    logging.getLogger("operations").info("%s %s %s", now(), action, entity_id)


def dirty(con, table, key):
    con.execute(
        "INSERT INTO sync_state (entity,entity_id,version,dirty,synced_at) VALUES (?,?,1,1,NULL) "
        "ON CONFLICT(entity,entity_id) DO UPDATE SET version=sync_state.version+1,dirty=1,synced_at=NULL",
        (table, key),
    )


def text(value, name, limit=200):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{name}格式不正確")
    return value.strip()


def number(value, name, minimum=0, maximum=999999):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name}必須是 {minimum} 到 {maximum} 的整數")
    return value


def primary_key(value, name):
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name}必須是正整數") from None
    return number(value, name, 1, 9223372036854775807)


def products():
    with database() as con:
        return [
            dict(row, is_active=bool(row["is_active"]), is_favorite=bool(row["is_favorite"]))
            for row in con.execute(
                "SELECT p.id,p.name,c.name category,p.price,p.is_active,p.is_favorite "
                "FROM products p JOIN categories c ON c.id=p.category_id WHERE p.deleted=0 ORDER BY p.id"
            )
        ]


def save_product(data, key=None):
    name = text(data.get("name"), "商品名稱")
    category = text(data.get("category"), "分類")
    price = number(data.get("price"), "單價")
    for flag in ("is_active", "is_favorite"):
        if type(data.get(flag)) is not bool:
            raise ValueError("商品狀態必須是布林值")
    key = primary_key(key, "商品識別碼") if key is not None else None
    with database() as con:
        con.execute("BEGIN IMMEDIATE")
        if key and not con.execute(
            "SELECT id FROM products WHERE id=? AND deleted=0", (key,)
        ).fetchone():
            raise LookupError("找不到商品")
        category_row = con.execute(
            "SELECT id FROM categories WHERE name=?", (category,)
        ).fetchone()
        if category_row:
            category_id = category_row["id"]
        else:
            category_id = con.execute(
                "INSERT INTO categories (name) VALUES (?)", (category,)
            ).lastrowid
            dirty(con, "categories", category_id)
        if key:
            con.execute(
                "UPDATE products SET category_id=?,name=?,price=?,is_active=?,is_favorite=? WHERE id=?",
                (category_id, name, price, data["is_active"], data["is_favorite"], key),
            )
        else:
            key = con.execute(
                "INSERT INTO products (category_id,name,price,is_active,is_favorite,deleted) VALUES (?,?,?,?,?,0)",
                (category_id, name, price, data["is_active"], data["is_favorite"]),
            ).lastrowid
        dirty(con, "products", key)
    audit("儲存商品", key)
    return products()


def delete_product(key):
    key = primary_key(key, "商品識別碼")
    with database() as con:
        if con.execute(
            "UPDATE products SET deleted=1,is_active=0 WHERE id=? AND deleted=0", (key,)
        ).rowcount != 1:
            raise LookupError("找不到商品")
        dirty(con, "products", key)
    audit("刪除商品", key)
    return products()


def orders(key=None):
    key = primary_key(key, "訂單識別碼") if key is not None else None
    with database() as con:
        result = []
        query = (
            "SELECT o.*,s.dirty,s.synced_at FROM orders o JOIN sync_state s "
            "ON s.entity='orders' AND s.entity_id=o.id"
        )
        params = (key,) if key else ()
        for row in con.execute(
            query + (" WHERE o.id=?" if key else "") + " ORDER BY o.created_at DESC", params
        ):
            order = dict(row)
            order.pop("request_hash")
            order.pop("request_id", None)
            order["items"] = [
                dict(item, subtotal=item["unit_price"] * item["quantity"])
                for item in con.execute(
                    "SELECT * FROM order_items WHERE order_id=? ORDER BY id", (row["id"],)
                )
            ]
            order["total_amount"] = sum(item["subtotal"] for item in order["items"])
            order["change_amount"] = row["received_amount"] - order["total_amount"]
            order["order_no"] = "#" + order_timestamp(row["created_at"])
            order["sync_status"] = "pending" if order.pop("dirty") else "synced"
            result.append(order)
        return result


def order_timestamp(value):
    return datetime.fromisoformat(value).astimezone(timezone(timedelta(hours=8))).strftime(
        "%Y%m%d-%H%M%S-%f"
    )


def checkout(data):
    request_id = text(data.get("id"), "交易識別碼", 36)
    try:
        if str(uuid.UUID(request_id)) != request_id:
            raise ValueError()
    except ValueError:
        raise ValueError("交易識別碼必須為 UUID") from None
    received = number(data.get("received_amount"), "實收金額")
    items = data.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError("訂單必須包含 1 到 100 個品項")
    digest = hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    with database() as con:
        con.execute("BEGIN IMMEDIATE")
        existing = con.execute(
            "SELECT id,request_hash FROM orders WHERE request_id=?", (request_id,)
        ).fetchone()
        if existing:
            key = existing["id"]
            if existing["request_hash"] != digest:
                raise ValueError("相同交易識別碼的內容不可不同，請先查閱訂單")
        else:
            timestamp = now()
            lines = []
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError("品項格式不正確")
                quantity = number(item.get("quantity"), "數量", 1, 999)
                product_id = item.get("product_id")
                if product_id is not None:
                    product_id = primary_key(product_id, "商品識別碼")
                    product = con.execute(
                        "SELECT * FROM products WHERE id=? AND deleted=0 AND is_active=1",
                        (product_id,),
                    ).fetchone()
                    if not product:
                        raise ValueError("商品不存在或已停售，請重新整理菜單")
                    name, price = product["name"], product["price"]
                    if item.get("unit_price") != price:
                        raise ValueError("商品價格已變更，請重新整理後重新點餐")
                else:
                    name = text(item.get("product_name"), "自訂品項名稱")
                    price = number(item.get("unit_price"), "自訂品項單價")
                lines.append((product_id, name, price, quantity))
            total = sum(line[2] * line[3] for line in lines)
            if received < total:
                raise ValueError("實收金額不足")
            key = con.execute(
                "INSERT INTO orders (created_at,received_amount,status,note,request_hash,request_id,updated_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (timestamp, received, "completed", "", digest, request_id, timestamp),
            ).lastrowid
            dirty(con, "orders", key)
            for product_id, name, price, quantity in lines:
                item_id = con.execute(
                    "INSERT INTO order_items (order_id,product_id,product_name,unit_price,quantity) VALUES (?,?,?,?,?)",
                    (key, product_id, name, price, quantity),
                ).lastrowid
                dirty(con, "order_items", item_id)
    audit("現金結帳", key)
    return dict(orders(key)[0], warning="HARDWARE_OFFLINE")


def update_order(key, data):
    key = primary_key(key, "訂單識別碼")
    if data.get("status") not in ("completed", "cancelled"):
        raise ValueError("訂單狀態不正確")
    note = data.get("note", "")
    if not isinstance(note, str) or len(note) > 1000:
        raise ValueError("備註過長或格式不正確")
    with database() as con:
        if con.execute(
            "UPDATE orders SET status=?,note=?,updated_at=? WHERE id=?",
            (data["status"], note, now(), key),
        ).rowcount != 1:
            raise LookupError("找不到訂單")
        dirty(con, "orders", key)
    audit("更新訂單狀態", key)
    return orders()


def save_settlement(data):
    cash = number(data.get("cash_actual"), "盤點現金", 0, 999999999)
    note = data.get("notes", "")
    if not isinstance(note, str) or len(note) > 1000:
        raise ValueError("備註格式不正確")
    request_id = text(data.get("request_id") or data.get("id"), "日結請求識別碼", 100)
    date = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    timestamp = now()
    with database() as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute(
            "SELECT * FROM settlements WHERE request_id=?", (request_id,)
        ).fetchone()
        if row is None:
            key = con.execute(
                "INSERT INTO settlements (request_id,date,cash_actual,notes,created_at) VALUES (?,?,?,?,?)",
                (request_id, date, cash, note, timestamp),
            ).lastrowid
            dirty(con, "settlements", key)
            row = con.execute("SELECT * FROM settlements WHERE id=?", (key,)).fetchone()
        else:
            key = row["id"]
        row = dict(row)
        total, count = con.execute(
            "SELECT COALESCE(SUM(i.unit_price*i.quantity),0),COUNT(DISTINCT o.id) "
            "FROM orders o JOIN order_items i ON i.order_id=o.id "
            "WHERE o.status='completed' AND date(o.created_at,'+8 hours')=?",
            (row["date"],),
        ).fetchone()
    audit("儲存日結盤點", key)
    return dict(
        row,
        total_sales=total,
        order_count=count,
        cash_expected=total,
        discrepancy=row["cash_actual"] - total,
    )
