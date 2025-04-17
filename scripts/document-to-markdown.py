import sys
from markitdown import MarkItDown

if len(sys.argv) != 2:
    print("Usage: python document-to-markdown.py <input_file>")
    sys.exit(1)

input_file = sys.argv[1]

md = MarkItDown()
result = md.convert(input_file)

print(result.text_content)
