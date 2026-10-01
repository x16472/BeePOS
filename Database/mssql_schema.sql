-- 請先選取專供 Bee POS 使用的空白資料庫，再手動執行此初始化腳本。
-- 舊版 UUID / NVARCHAR 主鍵資料庫請先備份，再另建資料庫執行本腳本。
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.categories', 'U') IS NULL
CREATE TABLE dbo.categories (
    id BIGINT NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL UNIQUE
);

IF OBJECT_ID('dbo.products', 'U') IS NULL
CREATE TABLE dbo.products (
    id BIGINT NOT NULL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES dbo.categories(id),
    name NVARCHAR(200) NOT NULL,
    price INT NOT NULL CHECK (price >= 0),
    is_active BIT NOT NULL,
    is_favorite BIT NOT NULL,
    deleted BIT NOT NULL DEFAULT 0,
    CONSTRAINT uq_products_category_name UNIQUE (category_id, name)
);

IF OBJECT_ID('dbo.orders', 'U') IS NULL
CREATE TABLE dbo.orders (
    id BIGINT NOT NULL PRIMARY KEY,
    created_at NVARCHAR(40) NOT NULL,
    received_amount INT NOT NULL CHECK (received_amount >= 0),
    status NVARCHAR(20) NOT NULL CHECK (status IN ('completed', 'cancelled')),
    note NVARCHAR(1000) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    request_id NVARCHAR(36) NOT NULL UNIQUE,
    updated_at NVARCHAR(40) NOT NULL
);

IF OBJECT_ID('dbo.order_items', 'U') IS NULL
CREATE TABLE dbo.order_items (
    id BIGINT NOT NULL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES dbo.orders(id),
    product_id BIGINT NULL REFERENCES dbo.products(id),
    product_name NVARCHAR(200) NOT NULL,
    unit_price INT NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0)
);

IF OBJECT_ID('dbo.settlements', 'U') IS NULL
CREATE TABLE dbo.settlements (
    id BIGINT NOT NULL PRIMARY KEY,
    request_id NVARCHAR(36) NOT NULL UNIQUE,
    date CHAR(10) NOT NULL,
    cash_actual INT NOT NULL CHECK (cash_actual >= 0),
    notes NVARCHAR(1000) NOT NULL,
    created_at NVARCHAR(40) NOT NULL
);

IF OBJECT_ID('dbo.sync_versions', 'U') IS NULL
CREATE TABLE dbo.sync_versions (
    entity NVARCHAR(30) NOT NULL,
    entity_id BIGINT NOT NULL,
    version BIGINT NOT NULL,
    PRIMARY KEY (entity, entity_id)
);

COMMIT;
