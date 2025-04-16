#!/bin/bash

# 実行するディレクトリに移動
cd $(dirname $0)

input_file=$1
output_file_format=$2
output_file_prefix=$3
model_name=$4

if [ -z "$input_file" ] || [ -z "$output_file_format" ]; then
  echo "Usage: $0 <input_file> <output_file_format> [output_file_prefix] [model_name]"
  exit 1
fi

# txt,vtt,srt,tsv,jsonのみ指定可能
if [ "$output_file_format" != "txt" ] && [ "$output_file_format" != "vtt" ] && [ "$output_file_format" != "srt" ] && [ "$output_file_format" != "tsv" ] && [ "$output_file_format" != "json" ]; then
  echo "Usage: $0 <input_file> <output_file_format> [output_file_prefix] [model_name]"
  exit 1
fi

# 出力ファイル名のプレフィックスが指定されていない場合はデフォルト値を使用
if [ -z "$output_file_prefix" ]; then
  output_file_prefix=".audio-to-text"
fi

# モデル名が指定されていない場合はデフォルト値を使用
if [ -z "$model_name" ]; then
  model_name="mlx-community/whisper-large-v3-turbo"
fi

output_file="${output_file_prefix}.${output_file_format}"

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

# ファイルを処理
mlx_whisper $input_file --output-name $output_file --language ja --output-format $output_file_format --verbose False --model $model_name
