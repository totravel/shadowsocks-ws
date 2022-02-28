# Shadowsocks over WebSocket

[![Build Status](https://travis-ci.org/totravel/shadowsocks-ws.svg?branch=master)](https://travis-ci.org/totravel/shadowsocks-ws)
![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，可以部署在 [Heroku][heroku] 等托管平台。

```
        socks5            tcp               websocket                tcp
client <------> ss-local <---> ss-ws-local <-- gfw --> ss-ws-remote <---> target
                encrypt                                decrypt
```

shadowsocks-ws 客户端只负责转发经过加密的流量，须配合 [Shadowsocks for Windows][sfw] 等现有 Shadowsocks 客户端使用。shadowsocks-ws 客户端和服务器端之间使用 WebSocket 协议进行通信。shadowsocks-ws 服务器对外表现为一个 Web 服务器，可以用浏览器访问。

## 环境要求

- [Node.js](https://nodejs.dev/) 16.13.2+
- [Git for Windows](https://gitforwindows.org/)
- [Windows Terminal](https://github.com/microsoft/terminal)

## 部署

### Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Ftotravel%2Fshadowsocks-ws&envs=METHOD%2CPASS%2CPORT&METHODDesc=Only+%27chacha20-ietf-poly1305%27+and+%27aes-256-gcm%27+are+supported.&PASSDesc=Your+password.&PORTDesc=1-65535&METHODDefault=chacha20-ietf-poly1305&PASSDefault=secret&PORTDefault=80&referralCode=Vd85VV)

## 本地配置

克隆代码到本地，安装依赖：

```shell
$ git clone https://github.com/totravel/shadowsocks-ws.git
$ cd shadowsocks-ws
$ npm i
```

将配置文件 `config.json.example` 重命名为 `config.json` 并修改 `remote_address`、`password` 和 `method` 三个字段。

```json
{
  "dns": "https://cloudflare-dns.com/dns-query",
  "remote_address": "https://*.example.com/",
  "remote_port": 80,
  "local_address": "127.0.0.1",
  "local_port": 8787,
  "timeout": 5000,
  "password": "secret",
  "method": "aes-256-gcm"
}
```

`dns` 字段一般无须修改。下列取值供参考：

- DNSPod `https://doh.pub/dns-query`
- AliDNS `https://dns.alidns.com/resolve`
- 360DNS `https://doh.360.cn/query`

启动 shadowsocks-ws 客户端：

```shell
$ node --no-warnings local.mjs
ss://...
resolving ...
trying ...
server running on host ...
listening on port 8787
```

### Shadowsocks for Windows

打开 [Shadowsocks for Windows][sfw]：

1. 系统托盘 > 上下文菜单
    1. 服务器 > 扫描屏幕上的二维码
    1. 系统代理 > PAC 模式

### Clash for Windows

将配置文件 `clash.yaml.example` 重命名为 `clash.yaml` 并修改 `cipher` 和 `password` 两个字段。

```yaml
proxies:
  - name: "ss1"
    type: ss
    server: 127.0.0.1
    port: 8787
    cipher: aes-256-gcm
    password: "secret"

proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - ss1

rules:
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
```

打开 [Clash for Windows][cfw]：

1. 配置 > 导入上述配置文件
1. 主页 > 打开「系统代理」开关
1. 代理 > 规则

#### 获取和使用规则集

执行脚本 `ruleset.sh` 下载 [Clash 规则集][clash-rules]。

```shell
$ ./ruleset.sh
dowloading reject.yaml...
dowloading icloud.yaml...
dowloading apple.yaml...
dowloading google.yaml...
dowloading proxy.yaml...
dowloading direct.yaml...
dowloading private.yaml...
dowloading gfw.yaml...
dowloading greatfire.yaml...
dowloading tld-not-cn.yaml...
dowloading telegramcidr.yaml...
dowloading cncidr.yaml...
dowloading lancidr.yaml...
dowloading applications.yaml...
```

使用规则集的配置文件的模板为 `blacklist.yaml.example` 或 `whitelist.yaml.example`。

### SagerNet for Android

将手机和电脑连接至同一网络，打开 [SagerNet for Android][sn]：

1. 右上角 > 添加服务器配置 > 扫描二维码
1. 修改服务器配置 > 将「服务器」字段由 `127.0.0.1` 修改为电脑的 IP 地址
1. 右下角 > 连接

## 鸣谢

- [websockets/ws][ws] Simple to use, blazing fast and thoroughly tested WebSocket client and server for Node.js
- [vasco-santos/dns-over-http-resolver][dns-over-http-resolver] DNS over HTTP resolver 
- [Marak/colors][colors] get colors in your node.js console 
- [soldair/qrcode][qrcode] qr code generator
- [Shadowsocks for Windows][sfw] A C# port of shadowsocks 
- [Clash for Windows][cfw] clash for windows汉化版. 提供clash for windows的汉化版, 汉化补丁及汉化版安装程序
- [Loyalsoldier/clash-rules][clash-rules] 🦄️ 🎃 👻 Clash Premium 规则集(RULE-SET)，兼容 ClashX Pro、Clash for Windows 客户端。
- [SagerNet for Android][sn] The universal proxy toolchain for Android

## 许可协议

[MIT](LICENSE)

[heroku]: https://www.heroku.com/
[sfw]: https://github.com/shadowsocks/shadowsocks-windows
[cfw]: https://github.com/ender-zhao/Clash-for-Windows_Chinese
[clash-rules]: https://github.com/Loyalsoldier/clash-rules
[sn]: https://github.com/SagerNet/SagerNet
[ws]: https://github.com/websockets/ws
[dns-over-http-resolver]: https://github.com/vasco-santos/dns-over-http-resolver
[colors]: https://github.com/Marak/colors.js
[qrcode]: https://github.com/soldair/node-qrcode
