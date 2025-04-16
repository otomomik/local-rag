import sys
import json
from mlx_embeddings import load, generate

if len(sys.argv) != 3:
    print("Usage: python text-to-vector.py <content> <model_name>")
    sys.exit(1)

content = sys.argv[1]
model_name = sys.argv[2]

model, tokenizer = load(model_name)
generated = generate(model, tokenizer, content)
text_embeds = generated.text_embeds

print(f"result: {json.dumps(text_embeds.tolist()[0])}")