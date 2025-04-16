import json
from mlx_embeddings import load
import mlx.core as mx

with open(".embedding-input.txt", "r") as f:
    text = f.read()

model, tokenizer = load("mlx-community/nomicai-modernbert-embed-base-bf16")

# For text embeddings
input_ids = tokenizer.encode(text, return_tensors="mlx")
outputs = model(input_ids)
text_embeds = outputs.text_embeds # mean pooled and normalized embeddings

with open(".embedding-output.json", "w") as f:
    json.dump(text_embeds.tolist()[0], f)