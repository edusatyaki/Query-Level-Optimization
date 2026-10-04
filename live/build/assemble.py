#!/usr/bin/env python3
"""Build index.html = the deck shell (design + scenes + engine, shared with
the Query-Level Optimization animated deck) + deck.css + deck.js.
plans.js stays a separate file; build/capture.py regenerates it.

    python3 build/assemble.py
"""
import os
B = os.path.dirname(os.path.abspath(__file__))
rd = lambda f: open(os.path.join(B, f), encoding="utf-8").read()
head = rd("shell-head.html").replace("</style>", rd("deck.css") + "\n</style>", 1)
html = (head + '\n<script src="plans.js"></script>\n<script>\n' + rd("deck.js") + "\n</script>\n"
        + rd("shell-engine.html"))
open(os.path.join(os.path.dirname(B), "index.html"), "w", encoding="utf-8").write(html)
print("wrote index.html")
