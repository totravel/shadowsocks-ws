#!/bin/bash
set -e

files=(
  reject
  icloud
  apple
  google
  proxy
  direct
  private
  gfw
  greatfire
  tld-not-cn
  telegramcidr
  cncidr
  lancidr
  applications
)

url=https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/

if [ ! -d ~/.config/clash ]; then
  echo requires clash installed.
  exit 1
fi

if [ ! -d ~/.config/clash/ruleset ]; then
  mkdir ~/.config/clash/ruleset
fi

for file in ${files[@]}; do
  echo downloading ${file}.yaml...
  curl ${url}${file}.txt \
    -s -S -k \
    -x socks5h://127.0.0.1:7890 \
    -o ~/.config/clash/ruleset/${file}.yaml
done
