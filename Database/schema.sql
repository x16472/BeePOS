PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS categories (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id),
 name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
 is_active INTEGER NOT NULL, is_favorite INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, received_amount INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('completed','cancelled')), note TEXT NOT NULL,
 request_hash TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 product_id TEXT REFERENCES products(id), product_name TEXT NOT NULL,
 unit_price INTEGER NOT NULL CHECK(unit_price >= 0), quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS settlements (
 id TEXT PRIMARY KEY, date TEXT NOT NULL, cash_actual INTEGER NOT NULL,
 notes TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (
 entity TEXT NOT NULL, entity_id TEXT NOT NULL, version TEXT NOT NULL,
 dirty INTEGER NOT NULL, synced_at TEXT, PRIMARY KEY(entity, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_logs (
 id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, orders_synced INTEGER NOT NULL,
 status TEXT NOT NULL, message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS initialization_state (
 name TEXT PRIMARY KEY, completed_at TEXT NOT NULL
);
