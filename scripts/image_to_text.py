import sys
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config


if len(sys.argv) != 4:
    print("Usage: python image_to_text.py <input_file> <model_name> <prompt>")
    sys.exit(1)

input = sys.argv[1]
model_path = sys.argv[2]
prompt = sys.argv[3]

if not input or not model_path or not prompt:
    print("Usage: python image_to_text.py <input_file> <model_name> <prompt>")
    sys.exit(1)

# Load model and processor
model, processor = load(model_path, use_fast=True)
config = load_config(model_path)

# Format prompt
formatted_prompt = apply_chat_template(
    processor, config, prompt, num_images=1, add_generation_prompt=True
)

# Generate output
output = generate(model, processor, formatted_prompt, [input], verbose=False)
print(output)
