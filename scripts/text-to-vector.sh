#!/bin/bash

# 実行するディレクトリに移動
cd $(dirname $0)

input_file=$1
output_file=$2
model_name=$3

if [ -z "$input_file" ] || [ -z "$output_file" ] || [ -z "$model_name" ]; then
  echo "Usage: $0 <input_file> <output_file> <model_name>"
  exit 1
fi

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
python text-to-vector.py "$input_file" "$output_file" "$model_name"
