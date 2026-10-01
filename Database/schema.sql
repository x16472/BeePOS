PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories (id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    received_amount INTEGER NOT NULL CHECK (received_amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled')),
    note TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id),
    product_id INTEGER REFERENCES products (id),
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL,
    cash_actual INTEGER NOT NULL CHECK (cash_actual >= 0),
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    entity TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    dirty INTEGER NOT NULL CHECK (dirty IN (0, 1)),
    synced_at TEXT,
    PRIMARY KEY (entity, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    orders_synced INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS initialization_state (
    name TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
);

PRAGMA user_version = 2;
