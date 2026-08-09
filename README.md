# ⭐ Star 一下支持项目 ⭐

动动发财手点点 Star ⭐

基于 Cloudflare Workers 部署的 **PellaFree 自动续期 + 隧道监控自动重启面板**

## 📌 功能说明

- ✅ **多账号自动续期**：支持绑定多个 PellaFree 账号，每天定时自动完成续期。
- ✅ **隧道监控与异常重启**：定时检测指定的 Argo 隧道域名，发现离线后自动调用底层 API 重启服务器。
- ✅ **智能双轨 Cron 触发**：代码层智能识别 Cron 表达式，自动续期与隧道监控分离，高频监控不封号。
- ✅ **可视化管理面板**：提供精美的 Web 界面，支持输入密码后一键手动续期和重启指定/全部机器。
- ✅ **Telegram 通知推送**：续期结果报告、重启状态反馈、隧道异常实时告警。

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

## ⏰ 推荐的定时任务（Cron）配置为了实现“每天自动续期”同时“高频监控隧道异常”，强烈建议在 Cloudflare 控制台（触发器 Triggers 页面）中配置两个 Cron 任务：
```
30 1 * * *
*/10 * * * *

```
30 1 * * * (每天凌晨 01:30 执行) 👉 负责日常续期

*/10 * * * * (每 10 分钟执行一次) 👉 仅负责隧道健康检测（代码会自动过滤，绝对不会每 10 分钟去执行续期）

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
