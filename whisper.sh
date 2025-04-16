#!/bin/bash

# 実行するディレクトリに移動
cd $(dirname $0)

input_file=$1
output_file_format=$2
if [ -z "$output_file_format" ]; then
  output_file_format="txt"
fi

if [ -z "$input_file" ]; then
  echo "Usage: $0 <input_file> <output_file_format>"
  exit 1
fi

# txt,vtt,srt,tsv,jsonのみ指定可能
if [ "$output_file_format" != "txt" ] && [ "$output_file_format" != "vtt" ] && [ "$output_file_format" != "srt" ] && [ "$output_file_format" != "tsv" ] && [ "$output_file_format" != "json" ]; then
  echo "Usage: $0 <input_file> <output_file_format>"
  exit 1
fi

output_file=".whisper.$output_file_format"

is_first_run=true
# .venvが存在しない場合は作成
if [ ! -d ".venv" ]; then
  python -m venv .venv
  source .venv/bin/activate
else
  source .venv/bin/activate
  is_first_run=false
fi

# 依存パッケージをインストール
if $is_first_run; then
  pip install -r requirements.txt
fi

# ファイルを監視
mlx_whisper $input_file --output-name $output_file --language ja --output-format $output_file_format --verbose False --model mlx-community/whisper-large-v3-turbo
