# ⭐ Star 一下支持项目 ⭐

动动发财手点点 Star ⭐

基于 Cloudflare Workers 部署的 **PellaFree 自动续期 + 隧道监控自动重启面板**

## 📌 功能说明

- ✅ **多账号智能续期**：支持绑定多个 PellaFree 账号。内置动态时间算法，每天自动顺延 5 分钟执行，完美避开 24 小时广告冷却限制，大幅提高续期成功率。
- ✅ **隧道监控与自愈重启**：支持指定 Argo 隧道域名。系统会进行高频健康检测，一旦发现隧道离线，立即通过底层 API 自动重启服务器恢复网络。
- ✅ **极简单触发器架构**：只需配置唯一一个 `*/5 * * * *` 定时触发器，代码层会自动进行任务路由（高频监控与定时续期分离），既保证监控及时性，又绝对防止续期接口被滥用封号。
- ✅ **可视化 Web 面板**：内置精美的现代化 Web 界面，支持安全密码鉴权，随时可以一键手动触发续期，或重启指定/全部机器。
- ✅ **Telegram 全面推送**：不仅包含续期结果报告、重启状态反馈、隧道异常告警，还会贴心预告今天与明天的计划执行时间。

## ⚠️ 注意事项

❗ 仅支持 **Web 创建的机器（PellaFree）** ❗ 不支持 API / 其他来源创建的实例

## 📝 注册地址

👉 [https://www.pella.app/](https://www.pella.app/)

## 🚀 部署方式

使用 **Cloudflare Workers** 部署

## 🔧 环境变量配置

在 Cloudflare Workers 控制台的 **设置 (Settings) -> 变量和机密 (Variables and Secrets)** 中配置：

| 变量名 | 说明 | 是否必填 |
| ----- | ----- | ----- |
| `PASSWORD` | 访问 Web 面板的鉴权密码 (默认 pella123) | 必填 |
| `ACCOUNT` | 账号列表（格式见下） | 必填 |
| `ARGO_DOMAIN` | 需要监控的 Argo 隧道域名（如 `xxx.xxx.net`，多个用逗号隔开）。**填入该变量即自动开启隧道异常重启功能** | 选填 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 选填 |
| `TG_CHAT_ID` | Telegram Chat ID | 选填 |

## 📄 ACCOUNT 格式示例

```text
user1@gmail.com-----password1
user2@gmail.com-----password2
```

---

## ⏰ 触发器（Cron）配置要求

本项目采用“单触发器双轨智能调度”，只需在 Cloudflare 控制台的 **触发器 (Triggers)** 页面配置**唯一一个** Cron 表达式：
```
*/5 * * * *

```
**智能调度逻辑：**
- 🌐 **初始执行时间大约在 01:30 左右, (UTC+8 北京时间9:30左右) 
- 🛡️ **隧道监控**：每 5 分钟执行一次高频在线状态检测。
- 🔄 **自动续期**：代码会自动计算 24 小时冷却期，并每天自动顺延 5 分钟，在到达特定时间点时触发，**绝对不会**每 5 分钟执行一次导致封号。

---

## 🌐 使用方式

### 1️⃣ 浏览器手动续期

```
https://xxx.workers.dev/
```

---

### 2️⃣ API 触发续期（所有账号）

```bash
curl "https://xxx.workers.dev/?pwd=你的密码"
```

---

## 🔄 重启功能

### 1️⃣ 浏览器手动重启

```
https://xxx.workers.dev/
```

---

### 2️⃣ API 重启所有账号服务器

```bash
curl "https://xxx.workers.dev/restart?pwd=你的密码"
```

---

### 3️⃣ API 重启指定账号服务器

```bash
curl "https://xxx.workers.dev/restart?pwd=你的密码&account=user@gmail.com"
```

---

## 📸 效果展示

### 🔔 通知效果

![通知效果](img/通知效果.png)

### ⏰ Cron 设置

![Cron 定时](img/Cron定时.png)

### ⚙️ 环境变量

![环境变量](img/环境变量.png)

### 📢 注意事项 
- ❗ 仅支持 Web 创建的机器

![注意事项](img/注意：只支持web创建的机器.png)

---

## 💬Telegram 通知说明
配置 TG_BOT_TOKEN 和 TG_CHAT_ID 后：

✅ 每日续期结果汇总推送

✅ 隧道探测异常告警 & 自动重启结果推送

✅ 面板手动触发的操作结果推送

* ❌ 失败告警

---

## ❤️ 支持项目

如果这个项目对你有帮助：

👉 点个 **Star ⭐** 支持一下吧！

---
## ⚠️ 免责声明

本项目仅供学习研究使用。使用本脚本产生的任何后果由使用者自行承担。请遵守 www.pella.app 的服务条款。
