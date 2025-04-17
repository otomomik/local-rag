import sys
import mlx.core as mx
from mlx_vlm import load, generate
from mlx_vlm.utils import load_config
from mlx_vlm.video_generate import process_vision_info

if len(sys.argv) != 4:
    print("Usage: python video_to_text.py <input_file> <model_name> <prompt>")
    sys.exit(1)

input = sys.argv[1]
model_path = sys.argv[2]
prompt = sys.argv[3]

if not input or not model_path or not prompt:
    print("Usage: python video_to_text.py <input_file> <model_name> <prompt>")
    sys.exit(1)

# Load model and processor
model, processor = load(model_path, use_fast=True)
config = load_config(model_path)

# Create messages for video input
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "video",
                "video": input,
                "max_pixels": 224 * 224,  # Default value
                "fps": 1.0,  # Default value
            },
            {"type": "text", "text": prompt},
        ],
    }
]
text = processor.apply_chat_template(
    messages, tokenize=False, add_generation_prompt=True
)

# Process video input
image_inputs, video_inputs, fps = process_vision_info(messages, True)
inputs = processor(
    text=[text],
    images=image_inputs,
    videos=video_inputs,
    padding=True,
    return_tensors="pt",
)
input_ids = mx.array(inputs["input_ids"])
pixel_values = inputs.get("pixel_values_videos", inputs.get("pixel_values", None))
if pixel_values is None:
    raise ValueError("Please provide a valid video or image input.")
pixel_values = mx.array(pixel_values)

mask = mx.array(inputs["attention_mask"])

kwargs = {}
if inputs.get("video_grid_thw", None) is not None:
    kwargs["video_grid_thw"] = mx.array(inputs["video_grid_thw"])
if inputs.get("image_grid_thw", None) is not None:
    kwargs["image_grid_thw"] = mx.array(inputs["image_grid_thw"])

kwargs["video"] = input
kwargs["input_ids"] = input_ids
kwargs["pixel_values"] = pixel_values
kwargs["mask"] = mask
kwargs["max_tokens"] = 4096

# Generate output
output = generate(
    model,
    processor,
    prompt=text,
    verbose=False,
    **kwargs,
)
print(output)
