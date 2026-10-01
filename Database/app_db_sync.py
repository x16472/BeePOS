import logging
import os
import sys
import threading
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "Backend"))
import store

from Backend.http_worker import serve

SYNC_LOCK = threading.Lock()
STATUS_LOCK = threading.Lock()
STATUS = {"isHomeLabReachable": False, "lastSyncTime": None, "message": "尚未嘗試連線"}
LOGGER = logging.getLogger(__name__)


def connect_remote():
    connection_string = os.environ.get("BEE_MSSQL_CONNECTION_STRING")
    if not connection_string:
        raise RuntimeError("尚未設定 MSSQL 連線字串")
    try:
        import pyodbc
    except ImportError:
        raise RuntimeError("尚未安裝 pyodbc 或 SQL Server ODBC 驅動程式")
    connection = pyodbc.connect(connection_string, timeout=5, autocommit=False)
    connection.timeout = 10
    return connection


def synchronize():
    if not SYNC_LOCK.acquire(blocking=False):
        return 409, {"error": "同步執行中，請稍候"}
    remote = None
    count = 0
    try:
        with store.database() as local:
            local.execute("BEGIN")
            pending = [
                dict(r) for r in local.execute("SELECT * FROM sync_state WHERE dirty=1")
            ]
            snapshots = {
                table: {
                    r["id"]: dict(r) for r in local.execute(f"SELECT * FROM {table}")
                }
                for table in store.TABLES
            }
        remote = connect_remote()
        cursor = remote.cursor()
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        for table in store.TABLES:
            for state in (s for s in pending if s["entity"] == table):
                row = snapshots[table][state["entity_id"]]
                columns = list(row)
                assignments = ",".join(f"[{c}]=?" for c in columns if c != "id")
                values = [row[c] for c in columns if c != "id"]
                exists = cursor.execute(
                    f"SELECT id FROM dbo.{table} WITH (UPDLOCK,HOLDLOCK) WHERE id=?",
                    row["id"],
                ).fetchone()
                if exists:
                    cursor.execute(
                        f"UPDATE dbo.{table} SET {assignments} WHERE id=?",
                        *values,
                        row["id"],
                    )
                else:
                    cursor.execute(
                        f"INSERT INTO dbo.{table} ({','.join('[' + c + ']' for c in columns)}) "
                        f"VALUES ({','.join('?' for _ in columns)})",
                        *row.values(),
                    )
                exists = cursor.execute(
                    "SELECT entity_id FROM dbo.sync_versions WITH (UPDLOCK,HOLDLOCK) WHERE entity=? AND entity_id=?",
                    table,
                    row["id"],
                ).fetchone()
                if exists:
                    cursor.execute(
                        "UPDATE dbo.sync_versions SET version=? WHERE entity=? AND entity_id=?",
                        state["version"],
                        table,
                        row["id"],
                    )
                else:
                    cursor.execute(
                        "INSERT INTO dbo.sync_versions VALUES (?,?,?)",
                        table,
                        row["id"],
                        state["version"],
                    )
                if table == "orders":
                    count += 1
        incoming = {}
        for table in store.TABLES:
            cursor.execute(f"SELECT * FROM dbo.{table}")
            columns = [c[0] for c in cursor.description]
            incoming[table] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        versions = {
            (r[0], r[1]): r[2]
            for r in cursor.execute(
                "SELECT entity,entity_id,version FROM dbo.sync_versions"
            ).fetchall()
        }
        remote.commit()
        timestamp = store.now()
        with store.database() as local:
            local.execute("BEGIN IMMEDIATE")
            for state in pending:
                # 避免遠端傳送期間的本地修改被誤標為已同步。
                local.execute(
                    "UPDATE sync_state SET dirty=0,synced_at=? WHERE entity=? AND entity_id=? AND version=?",
                    (timestamp, state["entity"], state["entity_id"], state["version"]),
                )
            for table in store.TABLES:
                for row in incoming[table]:
                    state = local.execute(
                        "SELECT dirty FROM sync_state WHERE entity=? AND entity_id=?",
                        (table, row["id"]),
                    ).fetchone()
                    if state and state["dirty"]:
                        continue
                    columns = list(row)
                    local.execute(
                        f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)}) "
                        f"ON CONFLICT(id) DO UPDATE SET {','.join(c + '=excluded.' + c for c in columns if c != 'id')}",
                        tuple(row.values()),
                    )
                    local.execute(
                        "INSERT INTO sync_state VALUES (?,?,?,0,?) ON CONFLICT(entity,entity_id) "
                        "DO UPDATE SET version=excluded.version,dirty=0,synced_at=excluded.synced_at",
                        (
                            table,
                            row["id"],
                            versions.get((table, row["id"]), 1),
                            timestamp,
                        ),
                    )
        message = f"同步完成，已上傳 {count} 筆訂單並取得遠端資料"
        with STATUS_LOCK:
            STATUS.update(
                isHomeLabReachable=True, lastSyncTime=timestamp, message=message
            )
        record("success", count, message)
        return 200, {"orders_synced": count, "message": message}
    except (RuntimeError, OSError, ValueError, TypeError) as exc:
        # 不記錄 ODBC 例外內容，避免連線資訊出現在紀錄檔。
        message = (
            str(exc)
            if isinstance(exc, RuntimeError)
            else "MSSQL 同步失敗，資料保留於本機，將稍後重試"
        )
        LOGGER.warning("同步失敗，例外類型：%s", type(exc).__name__)
        with STATUS_LOCK:
            STATUS.update(isHomeLabReachable=False, message=message)
        record("failed", 0, message)
        return 503, {"error": message}
    finally:
        if remote is not None:
            try:
                remote.close()
            except OSError:
                LOGGER.warning("關閉遠端連線失敗")
        SYNC_LOCK.release()


def record(status, count, message):
    with store.database() as con:
        con.execute(
            "INSERT INTO sync_logs (timestamp,orders_synced,status,message) VALUES (?,?,?,?)",
            (store.now(), count, status, message),
        )
        con.execute(
            "DELETE FROM sync_logs WHERE id NOT IN (SELECT id FROM sync_logs ORDER BY timestamp DESC LIMIT 100)"
        )


def dispatch(method, path, data=None):
    if method == "POST" and path == "/api/sync":
        return synchronize()
    if method == "GET" and path == "/api/sync/status":
        with store.database() as con:
            pending = con.execute(
                "SELECT COUNT(*) FROM sync_state WHERE entity='orders' AND dirty=1"
            ).fetchone()[0]
            logs = [
                dict(r)
                for r in con.execute(
                    "SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 30"
                )
            ]
        with STATUS_LOCK:
            return 200, dict(STATUS, pending_sync_count=pending, logs=logs)
    return 404, {"error": "找不到指定的 API"}


def background():
    interval = max(5, int(os.environ.get("BEE_SYNC_INTERVAL", "30")))
    while True:
        try:
            synchronize()
        except (RuntimeError, OSError, ValueError, TypeError):
            LOGGER.exception("同步背景工作失敗")
        threading.Event().wait(interval)


if __name__ == "__main__":
    store.setup_logging("app_db_sync")
    store.initialize()
    threading.Thread(target=background, daemon=True).start()
    serve(int(os.environ.get("BEE_SYNC_PORT", "8766")), dispatch)
