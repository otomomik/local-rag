#!/bin/bash

# 実行するディレクトリに移動
cd $(dirname $0)

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
python embedding.py
