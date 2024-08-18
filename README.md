# Shadowsocks over WebSocket

![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，支持 AEAD，支持反向代理，支持 TLS，可以部署在 PaaS 平台或常规 VPS 上，可以搭配 V2RayN 使用。

## 服务器部署

shadowsocks-ws 服务器既可以处理 Shadowsocks over WebSocket (over TLS) 流量，也可以处理 HTTP(S) 请求。对于后者，默认使用项目根目录下的 `index.html` 作为响应。

shadowsocks-ws 服务器使用下列环境变量：

- 基本
  - `METHOD` 加密方式，仅支持 `aes-256-gcm` 和 `chacha20-poly1305`，默认 `aes-256-gcm`
  - `PASS` 密码，默认 `secret`
  - `PORT` 端口号，默认 `80`
- 高级
  - `PROXY` 反向代理的目标网站，如 `https://github.com`，默认空
  - `CERT` 证书的路径，默认空
  - `CERT_KEY` 私钥的路径，默认空

### PaaS 平台

shadowsocks-ws 服务器可以部署在下列 PaaS 平台上：

- [Heroku][heroku]
- [Railway][railway]
- [Render][render]
- [Adaptable][adaptable]

配置环境变量的方法请参考各平台官方文档。

### 常规 VPS

克隆代码、安装依赖、打包模块：

```bash
git clone https://github.com/totravel/shadowsocks-ws.git
cd shadowsocks-ws
npm i
npm run build
```

#### 使用 PM2 创建守护进程

将 [PM2][pm2] 配置文件的模板 `ecosystem.config.js.example` 重命名为 `ecosystem.config.js` 并根据需要修改 `env` 结点下的字段。

```js
module.exports = {
  apps: [
    {
      name: "shadowsocks-ws",
      script: "./server.min.mjs",
      env: {
        "NODE_ENV": "production",
        "METHOD": "aes-256-gcm",
        "PASS": "secret",
        "PORT": 80
      }
    }
  ]
}
```

安装 PM2 并创建守护进程：

```bash
npm install pm2 -g
pm2 start ecosystem.config.js
```

有关 `pm2` 命令的更多用法请参考 [PM2][pm2] 官方文档。

#### 配置 SSL 证书以启用 TLS

在配有域名和证书的主机上，要启用 TLS，只需添加环境变量 `CERT` 和 `CERT_KEY`，分别指定证书和私钥的路径。

```js
module.exports = {
  apps: [
    {
      name: "shadowsocks-ws",
      script: "./server.min.mjs",
      env: {
        "NODE_ENV": "production",
        "METHOD": "aes-256-gcm",
        "PASS": "secret",
        "CERT": "fullchain.pem",   // your full chain certs
        "CERT_KEY": "privkey.pem", // your cert key
        "PORT": 443
      }
    }
  ]
}
```

重载配置文件以生效：

```bash
pm2 reload ecosystem.config.js
```

## 客户端配置

有两种方案，推荐使用第一种：

- V2RayN
- shadowsocks-ws 搭配 Shadowsocks for Windows / Clash for Windows / SagerNet for Android

### V2RayN

下载并运行 [V2RayN][v2rayn]：

1. 左上角 > 服务器 > 添加[Shadowsocks]服务器
    1. 填写地址、端口、密码、加密方式
    1. 传输协议选择 `ws`
    1. 有启用 TLS 的，传输层安全选择 `tls`
1. 底部中间 > 系统代理 > 自动配置系统代理
1. 底部右侧 > 路由 > 绕开大陆或黑名单


### shadowsocks-ws

克隆代码，安装依赖：

```bash
git clone https://github.com/totravel/shadowsocks-ws.git
cd shadowsocks-ws
npm i --omit=dev --omit=optional
```

将 shadowsocks-ws 配置文件的模板 `config.json.example` 重命名为 `config.json` 并修改其中的 `server`、`password` 和 `method` 三个字段。

```json
{
  "nameserver": "https://dns.alidns.com/dns-query",
  "server": "https://*.up.railway.app/",
  "server_address": [],
  "local_address": "127.0.0.1",
  "local_port": 8787,
  "password": "secret",
  "method": "aes-256-gcm",
  "timeout": 5000,
  "show_qrcode": true,
  "show_url": false
}
```

如果 `server` 字段的主机名字段不是一个 IP 地址，而是一个域名，shadowsocks-ws 就会自动进行 DNS 查询。若服务器的 IP 地址已知并且已经用 `server_address` 字段一一列出，则 shadowsocks-ws 就会直接使用。

`nameserver` 字段的值必须是公共 DoH 服务器的链接。下列取值供参考：

- [DNSPod](https://www.dnspod.cn/) `https://doh.pub/dns-query`
- [AliDNS](https://alidns.com/) `https://dns.alidns.com/dns-query`
- [360DNS](https://sdns.360.net/) `https://doh.360.cn/dns-query`
- [IPv6 DNS](https://www.ipv6dns.com/) `https://dns.ipv6dns.com/dns-query`
- [Cisco OpenDNS](https://www.opendns.com/) `https://doh.opendns.com/dns-query`
- [BebasDNS](https://github.com/bebasid/bebasdns) `https://dns.bebasid.com/dns-query`
- [AlekBergNl](https://alekberg.net/) `https://dnsnl.alekberg.net/dns-query`
- [AlekBergSE](https://alekberg.net/) `https://dnsse.alekberg.net/dns-query`
- [adfree](https://usableprivacy.com/) `https://adfree.usableprivacy.net/query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://1.1.1.1/dns-query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://1.0.0.1/dns-query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://cloudflare-dns.com/dns-query`

启动 shadowsocks-ws：

```bash
npm run local
```

下文根据需要选择性阅读：

### Shadowsocks for Windows

打开 [Shadowsocks for Windows][sfw]：

1. 系统托盘 > 上下文菜单
    1. 服务器 > 扫描屏幕上的二维码
    1. 系统代理 > PAC 模式

### Clash for Windows

将配置文件的模板 `clash.yaml.example` 重命名为 `clash.yaml` 并修改 `cipher` 和 `password` 两个字段。

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
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
```

打开 [Clash for Windows][cfw]：

1. 配置 > 导入上述配置文件
1. 主页 > 打开「系统代理」开关
1. 代理 > 规则

#### 获取和使用规则集

执行脚本 `ruleset.sh` 下载 [Clash 规则集][clash-rules]。

```bash
./ruleset.sh
```

使用规则集的配置文件的模板为 `blacklist.yaml.example` 或 `whitelist.yaml.example`。它们的用法与 `clash.yaml.example` 相同。

### SagerNet for Android

将手机和电脑连接至同一网络，打开 [SagerNet for Android][sn]：

1. 右上角 > 添加服务器配置 > 扫描二维码
1. 修改服务器配置 > 将「服务器」字段由 `127.0.0.1` 修改为电脑的 IP 地址
1. 右下角 > 连接

## 求助和反馈

求助和反馈可以在 [Issues](https://github.com/totravel/shadowsocks-ws/issues) 版块进行。

## 讨论和交流

讨论和交流可以在 [Discussions](https://github.com/totravel/shadowsocks-ws/discussions) 版块进行。

## 鸣谢

软件包：

- [websockets/ws][ws] Simple to use, blazing fast and thoroughly tested WebSocket client and server for Node.js
- [expressjs/express][express] Fast, unopinionated, minimalist web framework for node.
- [chimurai/http-proxy-middleware][proxy] The one-liner node.js http-proxy middleware for connect, express, next.js and more
- [byu-imaal/dohjs][dohjs] DNS over HTTPS client for use in the browser
- [Marak/colors][colors] get colors in your node.js console
- [soldair/qrcode][qrcode] qr code generator

客户端：

- [2dust/v2rayN][v2rayn] A GUI client for Windows, support Xray core and v2fly core and others 
- [Shadowsocks for Windows][sfw] A C# port of shadowsocks
- [Clash for Windows][cfw] clash for windows汉化版. 提供clash for windows的汉化版, 汉化补丁及汉化版安装程序
- [Loyalsoldier/clash-rules][clash-rules] Clash Premium 规则集(RULE-SET)，兼容 ClashX Pro、Clash for Windows 客户端。
- [SagerNet for Android][sn] The universal proxy toolchain for Android

## 许可协议

[MIT](LICENSE)

[heroku]: https://www.heroku.com/
[railway]: https://railway.app/
[render]: https://render.com/
[adaptable]: https://adaptable.io/

[pm2]: https://github.com/Unitech/pm2
[v2rayn]: https://github.com/2dust/v2rayN

[sfw]: https://github.com/shadowsocks/shadowsocks-windows
[cfw]: https://github.com/ender-zhao/Clash-for-Windows_Chinese
[clash-rules]: https://github.com/Loyalsoldier/clash-rules
[sn]: https://github.com/SagerNet/SagerNet
[ss-libev]: https://github.com/shadowsocks/shadowsocks-libev
[go-ss2]: https://github.com/shadowsocks/go-shadowsocks2
[ss-rust]: https://github.com/shadowsocks/shadowsocks-rust

[ws]: https://github.com/websockets/ws
[express]: https://expressjs.com/
[proxy]: https://github.com/chimurai/http-proxy-middleware
[dohjs]: https://github.com/byu-imaal/dohjs
[colors]: https://github.com/Marak/colors.js
[qrcode]: https://github.com/soldair/node-qrcode

[ss2022]: https://github.com/Shadowsocks-NET/shadowsocks-specs
