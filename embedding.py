import json
import sys
from mlx_embeddings import load, generate

if len(sys.argv) < 4:
    print("Usage: python embedding.py <input_file> <output_file> <model_name>")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2]
model_name = sys.argv[3]

with open(input_file, "r") as f:
    text = f.read()

model, tokenizer = load(model_name)

# For text embeddings
generated = generate(model, tokenizer, text)
text_embeds = generated.text_embeds
print(text,text_embeds)

with open(output_file, "w") as f:
    json.dump(text_embeds.tolist()[0], f)