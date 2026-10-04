#!/usr/bin/env python3
"""Dev server for the deck.

python -m http.server lets the browser reuse a cached copy, which means a plain
reload can keep showing an older build. This sends no-store on every response so
what you see is always the file on disk.

    python3 serve.py [port]        # default 8113
"""
import sys, os, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):            # quieter than the default
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8113
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    print("Deck on http://localhost:%d  (no-store; a plain reload always refreshes)" % port)
    ThreadingHTTPServer(("", port), handler).serve_forever()
