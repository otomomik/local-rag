import sys
from markdownify import markdownify as md

if len(sys.argv) != 2:
    print("Usage: python html-to-markdown.py <input_file>")
    sys.exit(1)

input_file = sys.argv[1]

with open(input_file, "r") as f:
    html = f.read()

print(md(html))
