
# Shadowsocks over WebSocket

[![Build Status](https://travis-ci.org/totravel/shadowsocks-ws.svg?branch=master)](https://travis-ci.org/totravel/shadowsocks-ws)
![Lines of code](https://img.shields.io/tokei/lines/github/totravel/shadowsocks-ws)
![GitHub repo size](https://img.shields.io/github/repo-size/totravel/shadowsocks-ws)
![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 可以隐匿 Shadowsocks 流量，可以部署在 [Heroku](https://www.heroku.com/)。

shadowsocks-ws 既是一个 Shadowsocks 服务器，也是一个 Web 服务器。也就是说，在部署 Shadowsocks 服务器的同时，也架设了一个实实在在的网站。

Shadowsocks 流量基于 WebSocket 协议传送给 Web 服务器，成为网站流量的一部分，再由 Web 服务器转交给 Shadowsocks 服务器，从而达到隐匿 Shadowsocks 流量的目的。

shadowsocks-ws 的本地组件只负责转发 Shadowsocks 流量，须配合现有 [Shadowsocks 客户端](https://github.com/shadowsocks/shadowsocks-windows) 使用。

## 环境要求

- [Node.js](https://nodejs.org/zh-cn/download/current) 15.10.0+
- [npm](https://nodejs.org/zh-cn/download/current) 7.6.0+
- [Git](https://gitforwindows.org/)
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

## 依赖包

- [colors](https://github.com/Marak/colors.js)
- [dns-over-http-resolver](https://github.com/vasco-santos/dns-over-http-resolver)
- [ws](https://github.com/websockets/ws)

## Heroku 起步

登录你的 Heroku 账户：

```shell
$ heroku auth:login -i
heroku: Enter your login credentials
Email: your@example.com
Password: *****
Logged in as your@example.com
```

如果你还没有 Heroku 账户，请前往 [Heroku 官网](https://www.heroku.com/) 注册。

将你的 SSH 公钥添加到 Heroku：

```shell
$ heroku keys:add
Found an SSH public key at /path/to/id_rsa.pub
? Would you like to upload it to Heroku? (Y/n) y
```

如果你还没有 SSH 公钥，请阅读 [生成/添加SSH公钥](https://gitee.com/help/articles/4181)。

## 部署在 Heroku

新建一个 APP：

```shell
$ heroku create
Creating app... done, ⬢ xxxxx
https://xxxxx.herokuapp.com/ | https://git.heroku.com/xxxxx.git
```

设置加密算法、密码：

```shell
$ heroku config:set METHOD="chacha20-ietf-poly1305" PASS=123456 --app xxxxx
```

仅支持 `chacha20-ietf-poly1305` 和 `aes-256-gcm` 两种加密算法。

克隆代码到本地，再推送到 APP：

```shell
$ git clone https://github.com/totravel/shadowsocks-ws.git
$ cd shadowsocks-ws
$ git push https://git.heroku.com/xxxxx.git master
```

## 本地配置

安装：

```shell
$ npm i
```

将配置文件 `config.json.example` 重命名为 `config.json` 并修改 `url`、`password` 和 `method` 字段。

```json
{
    "verbose": false,
    "url": "wss://xxxxx.herokuapp.com/",
    "dns": "https://cloudflare-dns.com/dns-query",
    "server": "127.0.0.1",
    "remote_port": 8787,
    "password": "123456",
    "method": "chacha20-ietf-poly1305"
}
```

`dns` 字段一般无须修改。下列取值供参考：

- DNSPod `https://doh.pub/dns-query`
- AliDNS `https://dns.alidns.com/resolve`
- 360DNS `https://doh.360.cn/query`

`verbose` 字段决定程序在运行过程中是否输出详细的提示信息和错误信息。

## 启用

双击 `setup.cmd` 即可启动本地组件：

```shell
loading...
parsing...
ss://...
resolving...
trying...
using ... used ...
have a good time!
```

首次使用，须完成下列步骤：

1. 复制链接 `ss://...` > 打开 Shadowsocks 客户端 > 在托盘区找到 Shadowsocks 客户端的图标 > 右击 > 服务器 > 从剪贴板导入 URL > ... > 确定。
1. 右击 Shadowsocks 客户端的图标 > PAC 模式 > 编辑 Geosite 的用户规则... > 在文件 `user-rule.txt` 中追加一行 `@@||herokuapp.com`。
1. 右击 Shadowsocks 客户端的图标 > 系统代理 > PAC 模式。

此后每次使用只须启动本地组件和 Shadowsocks 客户端即可。

## 许可协议

[The MIT License (MIT)](http://opensource.org/licenses/MIT)
