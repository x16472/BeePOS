import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


def serve(port, dispatch):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.handle_request()

        do_POST = do_PUT = do_PATCH = do_DELETE = do_GET

        def log_message(self, fmt, *args):
            logging.info(fmt, *args)

        def handle_request(self):
            self.connection.settimeout(15)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 <= length <= 1048576:
                    raise ValueError("要求內容過大")
                data = json.loads(self.rfile.read(length)) if length else {}
                if not isinstance(data, dict):
                    raise ValueError("要求內容必須是 JSON 物件")
                code, value = dispatch(
                    self.command, unquote(urlsplit(self.path).path).rstrip("/"), data
                )
            except (ValueError, TypeError) as exc:
                code, value = 400, {"error": str(exc)}
            except LookupError as exc:
                code, value = 404, {"error": str(exc)}
            except Exception:
                logging.exception("處理要求失敗")
                code, value = 503, {"error": "服務暫時無法處理，請稍後重試"}
            payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()
