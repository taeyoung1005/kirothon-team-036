#!/bin/zsh
# usage: run.sh <name> [extra codex-imagegen args]
cd "$(dirname $0)"; n=$1; shift
cat _common.txt $n.txt > /tmp/skillpick_$n.full.txt
codex-imagegen generate --prompt-file /tmp/skillpick_$n.full.txt --out ../${2:-$n}.png --size 1536x1024 --quality high --force
