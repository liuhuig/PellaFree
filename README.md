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
| `ARGO_DOMAIN` | 需要监控的 Argo 隧道域名（如 `mypella.xxx.net`，多个用逗号隔开）。**填入该变量即自动开启隧道异常重启功能** | 选填 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 选填 |
| `TG_CHAT_ID` | Telegram Chat ID | 选填 |

## 📄 ACCOUNT 格式示例

```text
user1@gmail.com-----password1
user2@gmail.com-----password2
