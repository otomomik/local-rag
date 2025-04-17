import sys
import mlx_whisper

if len(sys.argv) != 3:
    print("Usage: python audio-to-text.py <input_file> <model_name>")
    sys.exit(1)

input = sys.argv[1]
model = sys.argv[2]

if not input or not model:
    print("Usage: python audio-to-text.py <input_file> <model_name>")
    sys.exit(1)

segments = mlx_whisper.transcribe(
    input,
    path_or_hf_repo=model,
)["segments"]

results = []
for segment in segments:
    text = segment["text"]

    if text == "":
        continue

    results.append(text)

print("\n".join(results))
