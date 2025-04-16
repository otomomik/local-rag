#!/bin/bash

base_dir=$(pwd)
cd $(dirname $0)

target_dir=$1
if [ -z "$target_dir" ]; then
  target_dir="."
fi

npx @modelcontextprotocol/inspector npx tsx src/index.ts $base_dir $target_dir
