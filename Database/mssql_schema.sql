-- 請先選取專供 Bee POS 使用的資料庫，再手動執行此初始化腳本。
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.categories', 'U') IS NULL
CREATE TABLE dbo.categories (id NVARCHAR(36) PRIMARY KEY, name NVARCHAR(200) NOT NULL UNIQUE);
IF OBJECT_ID('dbo.products', 'U') IS NULL
CREATE TABLE dbo.products (
 id NVARCHAR(36) PRIMARY KEY, category_id NVARCHAR(36) NOT NULL REFERENCES dbo.categories(id),
 name NVARCHAR(200) NOT NULL, price INT NOT NULL CHECK(price>=0),
 is_active INT NOT NULL, is_favorite INT NOT NULL, deleted INT NOT NULL DEFAULT 0
);
IF OBJECT_ID('dbo.orders', 'U') IS NULL
CREATE TABLE dbo.orders (
 id NVARCHAR(36) PRIMARY KEY, created_at NVARCHAR(40) NOT NULL, received_amount INT NOT NULL,
 status NVARCHAR(20) NOT NULL CHECK(status IN ('completed','cancelled')), note NVARCHAR(1000) NOT NULL,
 request_hash NVARCHAR(64) NOT NULL, request_id NVARCHAR(36) NOT NULL UNIQUE, updated_at NVARCHAR(40) NOT NULL
);
IF COL_LENGTH('dbo.orders', 'request_id') IS NULL
BEGIN
 ALTER TABLE dbo.orders ADD request_id NVARCHAR(36) NULL;
 EXEC(N'UPDATE dbo.orders SET request_id=id');
 EXEC(N'CREATE UNIQUE INDEX idx_orders_request ON dbo.orders(request_id)');
END;
IF COL_LENGTH('dbo.orders', 'updated_at') IS NULL
BEGIN
 ALTER TABLE dbo.orders ADD updated_at NVARCHAR(40) NULL;
 EXEC(N'UPDATE dbo.orders SET updated_at=created_at');
END;
IF OBJECT_ID('dbo.order_items', 'U') IS NULL
CREATE TABLE dbo.order_items (
 id NVARCHAR(36) PRIMARY KEY, order_id NVARCHAR(36) NOT NULL REFERENCES dbo.orders(id),
 product_id NVARCHAR(36) REFERENCES dbo.products(id), product_name NVARCHAR(200) NOT NULL,
 unit_price INT NOT NULL CHECK(unit_price>=0), quantity INT NOT NULL CHECK(quantity>0)
);
IF OBJECT_ID('dbo.settlements', 'U') IS NULL
CREATE TABLE dbo.settlements (
 id NVARCHAR(36) PRIMARY KEY, date NVARCHAR(10) NOT NULL, cash_actual INT NOT NULL,
 notes NVARCHAR(1000) NOT NULL, created_at NVARCHAR(40) NOT NULL
);
IF OBJECT_ID('dbo.sync_versions', 'U') IS NULL
CREATE TABLE dbo.sync_versions (
 entity NVARCHAR(30) NOT NULL, entity_id NVARCHAR(36) NOT NULL, version NVARCHAR(36) NOT NULL,
 PRIMARY KEY(entity,entity_id)
);
COMMIT;
