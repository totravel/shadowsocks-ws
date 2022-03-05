#!/bin/bash

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

if [ ! -d ~/.config/clash/ruleset ]; then
  mkdir ~/.config/clash/ruleset
fi

for file in ${files[@]}; do
  echo dowloading ${file}.yaml...
  curl ${url}${file}.txt \
    -s -k \
    -x socks5h://127.0.0.1:7890 \
    -o ~/.config/clash/ruleset/${file}.yaml
done
