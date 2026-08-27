#!/usr/bin/env python3
"""
Liberatrade — local dev server.

    python serve.py            # http://localhost:8080
    python serve.py 3000       # pick a port
    python serve.py --no-open  # don't launch the browser

Serves this folder over HTTP. The dashboard uses ES modules and fetch(), so it
must be opened over http:// — double-clicking index.html gives a file:// origin
and the browser blocks both.
"""

import argparse
import functools
import http.server
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8080

# The Windows console defaults to cp1252, which cannot encode Thai — reconfigure
# to UTF-8 where the runtime allows it, and keep console output ASCII regardless.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Dev server: never let the browser cache a stale build.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else ""
        mark = "  " if str(code).startswith("2") else "! "
        sys.stderr.write(f"{mark}{args[0]}  {code}\n")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def free_port(start, tries=20):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise SystemExit(f"No free port in range {start}-{start + tries}")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-open", action="store_true", help="do not launch a browser")
    args = ap.parse_args()

    port = free_port(args.port)
    if port != args.port:
        print(f"  port {args.port} is busy - using {port} instead")

    url = f"http://localhost:{port}/"
    handler = functools.partial(Handler, directory=str(ROOT))

    with Server(("127.0.0.1", port), handler) as httpd:
        print("\n  Liberatrade dev server")
        print(f"  {url}")
        print(f"  serving {ROOT}")
        print("  press Ctrl+C to stop\n")

        if not args.no_open:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  server stopped")


if __name__ == "__main__":
    main()
