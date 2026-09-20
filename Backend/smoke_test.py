"""以暫存 SQLite 與靜態測試頁驗證 Go / Python 的 HTTP 整合。"""

import json
import os
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        (temp / "index.html").write_text(
            "Bee POS integration fixture", encoding="utf-8"
        )
        ports = set()
        while len(ports) < 3:
            ports.add(free_port())
        gateway, app, sync = ports
        env = dict(
            os.environ,
            BEE_ROOT=str(ROOT),
            BEE_STATIC_DIR=str(temp),
            BEE_DB_PATH=str(temp / "test.db"),
            BEE_PORT=str(gateway),
            BEE_APP_PORT=str(app),
            BEE_SYNC_PORT=str(sync),
            BEE_MSSQL_CONNECTION_STRING="",
            BEE_HOST="127.0.0.1",
        )
        process = subprocess.Popen(
            [str(ROOT / "Backend" / "beepos.exe")],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            start_new_session=os.name != "nt",
        )
        base = f"http://127.0.0.1:{gateway}"

        def request(path, method="GET", data=None, origin=None):
            headers = {"Content-Type": "application/json"}
            if origin:
                headers["Origin"] = origin
            req = urllib.request.Request(
                base + path,
                method=method,
                headers=headers,
                data=json.dumps(data).encode() if data is not None else None,
            )
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    return response.status, response.read().decode()
            except urllib.error.HTTPError as exc:
                return exc.code, exc.read().decode()

        try:
            for attempt in range(100):
                try:
                    if (
                        request("/api/health")[0] == 200
                        and request("/api/sync/status")[0] == 200
                    ):
                        break
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(0.1)
            else:
                raise AssertionError("主機服務未能啟動")
            assert "integration fixture" in request("/")[1]
            assert request("/.venv/pyvenv.cfg")[0] == 404
            assert (
                request("/api/products", "POST", {}, "http://example.invalid")[0] == 403
            )
            code, body = request(
                "/api/products",
                "POST",
                {
                    "name": "紅茶",
                    "category": "飲料",
                    "price": 30,
                    "is_active": True,
                    "is_favorite": False,
                },
            )
            assert code == 201, body
            product = next(p for p in json.loads(body) if p['name'] == '紅茶' and p['category'] == '飲料')
            payload = {
                "id": str(uuid.uuid4()),
                "received_amount": 100,
                "items": [
                    {"product_id": product["id"], "unit_price": 30, "quantity": 2}
                ],
            }
            code, body = request("/api/orders", "POST", payload)
            assert code == 200 and json.loads(body)["change_amount"] == 40, body
            order_id = json.loads(body)["id"]
            assert request("/api/orders", "POST", payload)[0] == 200
            assert len(json.loads(request("/api/orders")[1])) == 1
            assert request("/api/sync", "POST", {})[0] == 503
            assert json.loads(request("/api/orders")[1])[0]["sync_status"] == "pending"
            assert request("/api/products/" + product["id"], "DELETE")[0] == 200
            assert (
                request(
                    "/api/orders/" + order_id,
                    "PATCH",
                    {"status": "cancelled", "note": "測試"},
                )[0]
                == 200
            )
        finally:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    check=True,
                    stdout=subprocess.DEVNULL,
                )
            else:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        print(
            "PASS: Go static / gateway / two venv workers / CRUD / checkout / retry / offline sync / origin rejection / cleanup"
        )


if __name__ == "__main__":
    main()
