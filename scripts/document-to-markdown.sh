#!/bin/bash

# 実行するディレクトリに移動
cd $(dirname $0) > /dev/null

input_file=$1

if [ -z "$input_file" ]; then
  echo "Usage: $0 <input_file>"
  exit 1
fi

is_first_run=true
# .venvが存在しない場合は作成
if [ ! -d ".venv" ]; then
  python -m venv .venv > /dev/null
  source .venv/bin/activate > /dev/null
else
  source .venv/bin/activate > /dev/null
  is_first_run=false
fi

# 依存パッケージをインストール
if $is_first_run; then
  pip install -r requirements.txt > /dev/null
fi

# ファイルを処理
python document-to-markdown.py $input_file
