#!/usr/bin/env python3
"""Serve browser fixtures and relay their results to the shell runner."""

import io
import json
import re
import socket
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

results = Path(sys.argv[1])
root = Path(__file__).resolve().parents[2]
suites = {"storage", "scoreboards", "rooms", "friends"}
with socket.socket() as reservation:
    reservation.bind(("127.0.0.1", 0))
    worker_port = reservation.getsockname()[1]


class Handler(SimpleHTTPRequestHandler):
    progress = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def log_message(self, *args):
        pass

    def send_head(self):
        path = urlsplit(self.path).path
        suite = Path(path).stem
        if path == f"/tests/browser/{suite}.html" and suite in suites:
            self.progress[suite] = (0, "")
            text = (root / path.lstrip("/")).read_text()
            text = text.replace("<script", '<script src="report.js"></script>\n<script', 1)
        elif path == "/index.html":
            text = (root / "index.html").read_text()
            text = re.sub(
                r'(<meta name="logos-(rooms|scoreboards)-endpoint" content=")[^"]*',
                lambda m: f'{m[1]}http://127.0.0.1:{worker_port}/api/{m[2]}', text)
        else:
            return super().send_head()
        body = text.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(body)

    def do_POST(self):
        suite = self.path.removeprefix("/__result/")
        if suite not in suites or not self.path.startswith("/__result/"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 100000:
                raise ValueError("Invalid result length")
            report = json.loads(self.rfile.read(length))
            previous_seq, previous_text = self.progress.get(suite, (0, ""))
            if report["sequence"] > previous_seq:
                text = report["details"]
                extra = text[len(previous_text):] if text.startswith(previous_text) else text
                for line in extra.strip().splitlines():
                    print(f"{suite}: {line}", flush=True)
                self.progress[suite] = (report["sequence"], text)
                if report["ok"] is not None:
                    status = results / f"{suite}.pending"
                    status.write_text("0\n" if report["ok"] is True else "1\n")
                    status.replace(results / f"{suite}.result")
        except (ValueError, KeyError, TypeError) as error:
            self.send_error(400, str(error))
            return
        self.send_response(204)
        self.end_headers()


server = HTTPServer(("127.0.0.1", 0), Handler)
ports = results / "ports.pending"
ports.write_text(f"{server.server_port} {worker_port}\n")
ports.replace(results / "ports")
server.serve_forever()
