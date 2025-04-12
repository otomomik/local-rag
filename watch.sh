#!/bin/bash

base_dir=$(pwd)
cd $(dirname $0)

target_dir=$1
if [ -z "$target_dir" ]; then
    target_dir="."
fi

npm run watch $base_dir $target_dir 