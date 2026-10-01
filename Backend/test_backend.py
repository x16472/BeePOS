import copy
import os
import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Database"))
import app_db_sync
import store
from app_backend import dispatch


class RemoteCursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, query, *params):
        if query.startswith("SET TRANSACTION"):
            return self
        query = query.replace("dbo.", "").replace(" WITH (UPDLOCK,HOLDLOCK)", "")
        self.cursor.execute(query, params)
        return self

    @property
    def description(self):
        return self.cursor.description

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()


class RemoteConnection:
    def __init__(self, path, on_commit=None, fail_commit=False):
        self.connection = sqlite3.connect(path)
        self.on_commit = on_commit
        self.fail_commit = fail_commit

    def cursor(self):
        return RemoteCursor(self.connection)

    def commit(self):
        if self.fail_commit:
            raise ConnectionError("測試遠端提交失敗")
        self.connection.commit()
        if self.on_commit:
            self.on_commit()

    def close(self):
        self.connection.close()


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = store.DB_PATH
        store.DB_PATH = Path(self.temp.name) / "test.db"
        store.initialize(seed_menu=False)
        self.product = store.save_product(
            {
                "name": "紅茶",
                "category": "飲料",
                "price": 30,
                "is_active": True,
                "is_favorite": False,
            }
        )[0]
        self.payload = {
            "id": store.identifier(),
            "received_amount": 100,
            "items": [
                {"product_id": self.product["id"], "unit_price": 30, "quantity": 2}
            ],
        }

    def tearDown(self):
        store.DB_PATH = self.original
        self.temp.cleanup()

    def test_checkout_ignores_client_totals_and_survives_restart(self):
        self.payload["total_amount"] = 1
        order = store.checkout(self.payload)
        self.assertEqual((order["total_amount"], order["change_amount"]), (60, 40))
        self.assertEqual(order["warning"], "HARDWARE_OFFLINE")
        store.initialize(seed_menu=False)
        self.assertEqual(store.orders()[0]["id"], order["id"])

    def test_insufficient_cash_and_invalid_quantity_rollback(self):
        for amount, quantity in [(10, 2), (100, -1), (100, True), (100, 1.5)]:
            data = copy.deepcopy(self.payload)
            data["received_amount"] = amount
            data["items"][0]["quantity"] = quantity
            with self.assertRaises(ValueError):
                store.checkout(data)
        self.assertEqual(store.orders(), [])

    def test_concurrent_retries_are_idempotent(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: store.checkout(self.payload), range(6)))
        self.assertEqual(len(store.orders()), 1)
        self.assertEqual(len({r["id"] for r in results}), 1)
        self.payload["received_amount"] = 200
        with self.assertRaises(ValueError):
            store.checkout(self.payload)

    def test_price_edit_and_soft_delete_preserve_history(self):
        order = store.checkout(self.payload)
        store.save_product(dict(self.product, price=40), self.product["id"])
        self.assertEqual(store.orders()[0]["items"][0]["unit_price"], 30)
        self.payload["id"] = store.identifier()
        with self.assertRaises(ValueError):
            store.checkout(self.payload)
        store.delete_product(self.product["id"])
        self.assertEqual(store.products(), [])
        self.assertEqual(store.orders()[0]["total_amount"], 60)
        store.update_order(order["id"], {"status": "cancelled", "note": "顧客取消"})
        self.assertEqual(store.orders()[0]["status"], "cancelled")

    def test_mssql_failure_keeps_orders_pending(self):
        store.checkout(self.payload)
        with patch.dict(os.environ, {"BEE_MSSQL_CONNECTION_STRING": ""}):
            code, result = app_db_sync.synchronize()
        self.assertEqual(code, 503)
        self.assertEqual(store.orders()[0]["sync_status"], "pending")
        self.assertEqual(
            app_db_sync.dispatch("GET", "/api/sync/status", {})[1]["logs"][0]["status"],
            "failed",
        )
        self.payload["id"] = store.identifier()
        store.checkout(self.payload)
        self.assertEqual(len(store.orders()), 2)

    def test_wal_foreign_keys_and_no_views(self):
        with store.database() as con:
            self.assertEqual(con.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            self.assertEqual(con.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertEqual(
                con.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='view'"
                ).fetchone()[0],
                0,
            )

    def test_daily_settlement_and_reserved_routes(self):
        store.checkout(self.payload)
        result = store.save_settlement(
            {"id": store.identifier(), "cash_actual": 55, "notes": ""}
        )
        self.assertEqual((result["total_sales"], result["discrepancy"]), (60, -5))
        self.assertEqual(dispatch("POST", "/api/payments", {})[0], 501)

    def remote(self, **kwargs):
        path = Path(self.temp.name) / "remote.db"
        with closing(sqlite3.connect(path)) as con:
            con.executescript((store.ROOT / "schema.sql").read_text(encoding="utf-8"))
            con.execute(
                "CREATE TABLE IF NOT EXISTS sync_versions (entity TEXT,entity_id INTEGER,version INTEGER,PRIMARY KEY(entity,entity_id))"
            )
            con.commit()
        return RemoteConnection(path, **kwargs)

    def test_sync_ack_and_download_with_remote_test_double(self):
        store.checkout(self.payload)
        with patch.object(app_db_sync, "connect_remote", lambda: self.remote()):
            self.assertEqual(app_db_sync.synchronize()[0], 200)
        self.assertEqual(store.orders()[0]["sync_status"], "synced")
        with closing(sqlite3.connect(Path(self.temp.name) / "remote.db")) as con:
            con.execute(
                "UPDATE products SET price=35 WHERE id=?", (self.product["id"],)
            )
            con.commit()
        with patch.object(app_db_sync, "connect_remote", lambda: self.remote()):
            self.assertEqual(app_db_sync.synchronize()[0], 200)
        self.assertEqual(store.products()[0]["price"], 35)

    def test_remote_commit_failure_does_not_ack(self):
        store.checkout(self.payload)
        with patch.object(
            app_db_sync, "connect_remote", lambda: self.remote(fail_commit=True)
        ):
            self.assertEqual(app_db_sync.synchronize()[0], 503)
        self.assertEqual(store.orders()[0]["sync_status"], "pending")

    def test_timestamp_order_ids_and_modification_time(self):
        with patch.object(store, 'now', return_value='2026-09-20T18:34:20.123456+00:00'):
            first = store.checkout(self.payload)
            self.payload['id'] = store.identifier()
            second = store.checkout(self.payload)
        self.assertEqual((first['id'], second['id']), (1, 2))
        self.assertEqual(first['created_at'], first['updated_at'])
        with patch.object(store, 'now', return_value='2026-09-20T19:00:00+00:00'):
            store.update_order(first['id'], {'status': 'cancelled'})
        updated = store.orders(first['id'])[0]
        self.assertEqual(updated['created_at'], first['created_at'])
        self.assertEqual(updated['updated_at'], '2026-09-20T19:00:00+00:00')
        self.assertEqual(updated['order_no'], '#20260921-023420-123456')

    def test_menu_seed_once_preserves_edits_and_deletions(self):
        from menu_loader import initialize_menu, load_menu, MENU_PATH
        expected = load_menu(MENU_PATH)
        self.assertEqual(len(expected), 14)
        initialize_menu()
        self.assertEqual(len(store.products()), 15)
        seeded = next(p for p in store.products() if p['name'] == '招牌排骨便當')
        self.assertEqual((seeded['name'], seeded['price']), ('招牌排骨便當', 100))
        store.save_product(dict(seeded, price=120), seeded['id'])
        deleted = next(p for p in store.products() if p['name'] == '香酥大雞腿飯')
        store.delete_product(deleted['id'])
        store.initialize()
        self.assertEqual(next(p for p in store.products() if p['id'] == seeded['id'])['price'], 120)
        self.assertNotIn(deleted['id'], [p['id'] for p in store.products()])
        with store.database() as con:
            self.assertEqual(con.execute("SELECT dirty FROM sync_state WHERE entity='products' AND entity_id=?", (seeded['id'],)).fetchone()[0], 1)

    def test_bad_menu_rolls_back_all_seed_data(self):
        from menu_loader import initialize_menu
        bad = Path(self.temp.name) / 'bad.yaml'
        bad.write_text('version: 1\ncategories:\n  - name: 飲料\n    products:\n      - {id: p1, name: 茶, price: -1, is_active: true, is_favorite: false}', encoding='utf-8')
        with self.assertRaises(ValueError):
            initialize_menu(bad)
        self.assertEqual(len(store.products()), 1)
        with store.database() as con:
            self.assertEqual(con.execute('SELECT COUNT(*) FROM initialization_state').fetchone()[0], 0)

    def test_legacy_database_migration_preserves_order_identity(self):
        legacy = Path(self.temp.name) / 'legacy.db'
        with closing(sqlite3.connect(legacy)) as con:
            con.execute('CREATE TABLE orders (id TEXT PRIMARY KEY,created_at TEXT,received_amount INTEGER,status TEXT,note TEXT,request_hash TEXT)')
            con.execute('INSERT INTO orders VALUES (?,?,?,?,?,?)', ('legacy-id', '2026-09-20T18:00:00+00:00', 50, 'completed', '', 'hash'))
            con.commit()
        original = store.DB_PATH
        try:
            store.DB_PATH = legacy
            store.initialize(seed_menu=False)
            store.initialize(seed_menu=False)
            with store.database() as con:
                row = con.execute('SELECT * FROM orders').fetchone()
                self.assertEqual(row['id'], 1)
                self.assertEqual(row['request_id'], 'legacy-id')
                self.assertEqual(row['updated_at'], row['created_at'])
                self.assertEqual(con.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally:
            store.DB_PATH = original

    def test_edit_during_upload_stays_pending(self):
        order = store.checkout(self.payload)

        def concurrent_edit():
            store.update_order(
                order["id"], {"status": "cancelled", "note": "同步期間作廢"}
            )

        with patch.object(
            app_db_sync,
            "connect_remote",
            lambda: self.remote(on_commit=concurrent_edit),
        ):
            self.assertEqual(app_db_sync.synchronize()[0], 200)
        updated = store.orders()[0]
        self.assertEqual(
            (updated["status"], updated["sync_status"]), ("cancelled", "pending")
        )


if __name__ == "__main__":
    unittest.main()
