#!/usr/bin/env python3
"""
Simple local dev server for Aadhaar Registration Desk.
Run: python serve.py
Then open: http://localhost:8080
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8080

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"  {self.address_string()} — {format % args}")

print(f"\n  Aadhaar Registration Desk")
print(f"  ─────────────────────────")
print(f"  Server running at: http://localhost:{PORT}")
print(f"  Camera works at:   http://localhost:{PORT}")
print(f"\n  Press Ctrl+C to stop\n")

webbrowser.open(f"http://localhost:{PORT}")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
