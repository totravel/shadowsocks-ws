
# Shadowsocks over WebSocket

[![Build Status](https://travis-ci.org/totravel/shadowsocks-ws.svg?branch=master)](https://travis-ci.org/totravel/shadowsocks-ws)
![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，可以部署在 [Heroku](https://www.heroku.com/) 等托管平台。

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

## 部署

### Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### Railway

Create a empty project.

Connect to the project:

```shell
$ git clone https://github.com/totravel/shadowsocks-ws.git
$ cd shadowsocks-ws
$ railway link [projectId]
```

Add some variables:

```shell
$ railway variables set METHOD=aes-256-gcm
$ railway variables set PASS=secret
$ railway variables set PORT=80
```

Create a deployment: 

```shell
$ railway up
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
