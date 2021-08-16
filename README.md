
# Shadowsocks over WebSocket

[![Build Status](https://travis-ci.org/totravel/shadowsocks-ws.svg?branch=master)](https://travis-ci.org/totravel/shadowsocks-ws)
![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，可以部署在 [Heroku](https://www.heroku.com/)。

```
        socks5            tcp               websocket                tcp
client <------> ss-local <---> ss-ws-local <-- gfw --> ss-ws-remote <---> target
                encrypt                                decrypt
```

shadowsocks-ws 的客户端只负责转发经过加密的流量，须配合现有 [Shadowsocks 客户端](https://github.com/shadowsocks/shadowsocks-windows) 使用。shadowsocks-ws 的客户端和服务器端之间使用 WebSocket 协议进行通信。shadowsocks-ws 的服务器端对外表现为一个 Web 服务器，可以用浏览器访问。

## 环境要求

- [Node.js](https://nodejs.org/zh-cn/download/current) 12.20.1+
- [Git](https://gitforwindows.org/)
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

## 依赖项

- [colors](https://github.com/Marak/colors.js)
- [dns-over-http-resolver](https://github.com/vasco-santos/dns-over-http-resolver)
- [ws](https://github.com/websockets/ws)
- [futoin-hkdf](https://github.com/futoin/util-js-hkdf)

## 部署到 Heroku

### 一键部署

点击下面的按钮并根据提示操作。

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### 手动部署

打开终端，登录你的 Heroku 账户：

```shell
$ heroku auth:login -i
heroku: Enter your login credentials
Email: your@example.com
Password: *****
Logged in as your@example.com
```

将你的 SSH 公钥添加到 Heroku：

```shell
$ heroku keys:add
Found an SSH public key at /path/to/id_rsa.pub
? Would you like to upload it to Heroku? (Y/n) y
```

新建一个 APP：

```shell
$ heroku create
Creating app... done, ⬢ xxxxx
https://<your-app>.herokuapp.com/ | https://git.heroku.com/<your-app>.git
```

设置加密方法、密码：

```shell
$ heroku config:set METHOD="chacha20-ietf-poly1305" PASS="your-password" --app <your-app>
```

仅支持 `chacha20-ietf-poly1305` 和 `aes-256-gcm` 两种加密方法。

克隆代码到本地，再推送到 APP：

```shell
$ git clone https://github.com/totravel/shadowsocks-ws.git
$ cd shadowsocks-ws
$ git push https://git.heroku.com/<your-app>.git master
```

## 本地配置

克隆代码到本地，安装依赖项：

```shell
$ git clone https://github.com/totravel/shadowsocks-ws.git
$ cd shadowsocks-ws
$ npm i
```

将配置文件 `config.json.example` 重命名为 `config.json` 并修改 `remote_address`、`password` 和 `method` 三个字段。

```json
{
    "verbose": false,
    "dns": "https://cloudflare-dns.com/dns-query",
    "remote_address": "ws://<your-app>.herokuapp.com/",
    "remote_port": 80,
    "local_address": "127.0.0.1",
    "local_port": 8787,
    "timeout": 5000,
    "password": "your-password",
    "method": "chacha20-ietf-poly1305"
}
```

`remote_address` 字段的开头也可修改为 `wss://`。

`dns` 字段一般无须修改。下列取值供参考：

- DNSPod `https://doh.pub/dns-query`
- AliDNS `https://dns.alidns.com/resolve`
- 360DNS `https://doh.360.cn/query`

## 开始使用

双击 `setup.cmd` 即可启动服务：

```shell
loading...
ss://...
resolving...
trying...
using ... used ...
server has started
have a good time!
```

首次使用，须完成下列操作：

- 复制开头的 `ss://...`
- 在托盘区找到 Shadowsocks 客户端的图标 > 右击
    - 服务器 > 从剪贴板导入 URL
    - 系统代理 > PAC 模式

此后每次使用只须运行 `setup.cmd` 和 Shadowsocks 客户端即可。

## 许可协议

[The MIT License (MIT)](http://opensource.org/licenses/MIT)
