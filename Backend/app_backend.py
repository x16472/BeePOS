import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Database"))
import store
from http_worker import serve


def dispatch(method, path, data):
    parts = path.split("/")
    if method == "GET" and path == "/api/health":
        with store.database() as con:
            con.execute("SELECT 1 FROM orders LIMIT 1")
        return 200, {"status": "ok"}
    if path == "/api/products":
        if method == "GET":
            return 200, store.products()
        if method == "POST":
            return 201, store.save_product(data)
    if len(parts) == 4 and parts[2] == "products":
        if method == "PUT":
            return 200, store.save_product(data, parts[3])
        if method == "DELETE":
            return 200, store.delete_product(parts[3])
    if path == "/api/orders":
        if method == "GET":
            return 200, store.orders()
        if method == "POST":
            return 200, store.checkout(data)
    if method == "POST" and path == "/api/settlements":
        return 200, store.save_settlement(data)
    if len(parts) == 4 and parts[2] == "orders" and method == "PATCH":
        return 200, store.update_order(parts[3], data)
    if path in ("/api/payments", "/api/hardware", "/api/vpn"):
        return 501, {"error": "此功能尚未實作", "code": "NOT_IMPLEMENTED"}
    return 404, {"error": "找不到指定的 API"}


if __name__ == "__main__":
    store.setup_logging("app_backend")
    store.initialize()
    serve(int(os.environ.get("BEE_APP_PORT", "8765")), dispatch)
