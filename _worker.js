// _worker.js - PellaFree 自动续期 + 隧道异常自动重启面板

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const password = url.searchParams.get('pwd') || url.searchParams.get('password');
    const correctPassword = env.PASSWORD || 'pella123';

    // 1. 渲染前端面板
    if (url.pathname === '/' && !password) {
      return new Response(generateHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 2. 触发续期任务
    if (url.pathname === '/' || url.pathname === '/run') {
      if (password !== correctPassword) {
        return jsonResponse({ success: false, message: '访问密码错误' }, 401);
      }
      ctx.waitUntil(safeRun(() => main(env, 'renew')));
      return jsonResponse({ success: true, message: 'PellaFree 续期任务已触发，请查看 Telegram 通知' });
    }

    // 3. 触发重启任务
    if (url.pathname === '/restart') {
      if (password !== correctPassword) {
        return jsonResponse({ success: false, message: '访问密码错误' }, 401);
      }
      const targetAccount = url.searchParams.get('account') || null;
      ctx.waitUntil(safeRun(() => main(env, 'restart', targetAccount)));
      const msg = targetAccount ? `重启任务已触发，目标账号: ${targetAccount}` : '重启任务已触发，目标: 所有账号';
      return jsonResponse({ success: true, message: msg });
    }

    return jsonResponse({ success: false, message: '未知路由' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(safeRun(async () => {
      // 智能分流机制：通过识别 Cron 表达式执行不同任务
      
      // 1. 执行自动续期（只有在凌晨 01:30，或旧版未传递 cron 表达式时执行）
      if (!event.cron || event.cron === "30 1 * * *") {
        console.log("触发每日自动续期任务");
        await main(env, 'renew');
      }

      // 2. 执行隧道监控与异常重启（每次 Cron 触发都检查）
      if (env.ARGO_DOMAIN) {
        await checkAndAutoRestart(env);
      }
    }));
  }
};

async function safeRun(fn) {
  try { await fn(); } catch (error) { console.error('顶层执行异常:', error); }
}

// ==================== 隧道监控与自动重启 ====================
async function checkAndAutoRestart(env) {
  console.log("开始检测隧道状态...");
  const domainStr = env.ARGO_DOMAIN.trim();
  if (!domainStr) return;

  const domains = domainStr.split(',').map(d => d.trim()).filter(Boolean);
  let hasError = false;
  let failedDomains = [];

  for (const domain of domains) {
    try {
      const response = await fetch(`https://${domain}`, {
        method: 'GET',
        redirect: 'manual',
        cf: { cacheTtl: 0 }
      });
      // 只要返回 200~499 (含 404 等) 都认为 Argo 隧道在工作，5xx 代表网关/隧道断联
      const isOnline = response.status >= 200 && response.status < 500;
      if (!isOnline) {
        hasError = true;
        failedDomains.push(domain);
      }
    } catch (e) {
      hasError = true;
      failedDomains.push(domain);
    }
  }

  if (hasError) {
    console.log(`检测到隧道异常: ${failedDomains.join(', ')}，触发自动重启...`);
    if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      await sendTG(env, `⚠️ 隧道异常自动重启\n\n🌐 异常域名: ${failedDomains.join(', ')}\n🔄 正在通过底层 API 触发全账号重启...\n\nPellaFree Monitor`);
    }
    // 直接调用脚本内部的主函数执行全账号重启
    await main(env, 'restart', null); 
  } else {
    console.log('隧道状态检测正常。');
  }
}

// ==================== 主入口 ====================
async function main(env, mode = 'renew', targetAccount = null) {
  console.log(`开始执行 PellaFree ${mode === 'renew' ? '自动续期' : '重启'}...`);
  const accounts = parseAccounts(env.ACCOUNT);
  if (accounts.length === 0) {
    console.log('未找到有效账号');
    if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      await sendTG(env, `⚠️ PellaFree ${mode === 'renew' ? '续期' : '重启'}\n\n未找到有效账号，请检查 ACCOUNT 变量\n\nPellaFree Auto Renewal`);
    }
    return;
  }

  const targetAccounts = targetAccount ? accounts.filter(a => a.email.toLowerCase() === targetAccount.toLowerCase()) : accounts;
  if (targetAccounts.length === 0 && targetAccount) {
    if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      await sendTG(env, `⚠️ PellaFree ${mode === 'renew' ? '续期' : '重启'}\n\n未找到账号: ${targetAccount}\n请检查 ACCOUNT 变量\n\nPellaFree Auto Renewal`);
    }
    return;
  }

  const batchSize = 2;
  for (let i = 0; i < targetAccounts.length; i += batchSize) {
    const batch = targetAccounts.slice(i, i + batchSize);
    console.log(`处理第 ${Math.floor(i / batchSize) + 1} 批，共 ${batch.length} 个账号`);
    const tasks = batch.map(account => processOneAccount(account, mode, env));
    await Promise.all(tasks);
    if (i + batchSize < targetAccounts.length) await delay(1000);
  }
  console.log(`${mode === 'renew' ? '续期' : '重启'}任务完成`);
}

// ==================== 单账号处理 ====================
async function processOneAccount(account, mode, env) {
  console.log(`处理账号: ${account.email}`);
  let result;
  try {
    if (mode === 'renew') {
      result = await processAccountRenew(account);
    } else {
      result = await processAccountRestart(account);
    }
  } catch (error) {
    console.error(`账号 ${account.email} 处理失败:`, error);
    result = {
      email: account.email,
      mode,
      error: error.message,
      servers: [],
      renewResults: [],
      restartResults: []
    };
  }

  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
    try {
      const message = formatNotification(result, mode);
      await sendTG(env, message);
    } catch (tgError) {
      console.error('Telegram 通知发送失败:', tgError);
    }
  }
}

// ==================== 续期逻辑 ====================
async function processAccountRenew(account) {
  const authData = await login(account.email, account.password);
  if (!authData.token) throw new Error('登录失败');
  console.log(`账号 ${account.email} 登录成功`);

  let servers = await getServers(authData.token);
  console.log(`获取到 ${servers.length} 个服务器`);

  const beforeState = {};
  for (const server of servers) {
    beforeState[server.id] = { expiry: server.expiry, status: server.status, ip: server.ip };
  }

  const renewResults = [];
  for (const server of servers) {
    console.log(`\n处理服务器 ${server.id} (IP: ${server.ip})`);
    console.log(`调用 renew/update 刷新广告链接...`);
    try {
      const updateResp = await fetch(`https://api.pella.app/server/renew/update?id=${server.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authData.token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://www.pella.app',
          'Referer': 'https://www.pella.app/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: '{}'
      });
      const updateText = await updateResp.text();
      console.log(`renew/update 响应: ${updateResp.status} ${updateText}`);
    } catch (e) {
      console.error(`renew/update 失败:`, e.message);
    }

    await delay(800);

    let renewLinks = [];
    try {
      const detailResp = await fetch(`https://api.pella.app/server/detailed?id=${server.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authData.token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://www.pella.app',
          'Referer': 'https://www.pella.app/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const detailData = await detailResp.json();
      renewLinks = detailData.renew_links || [];
      console.log(`获取到 ${renewLinks.length} 个续期链接`);
    } catch (e) {
      console.error(`获取详情失败:`, e.message);
      renewLinks = server.renew_links || [];
    }

    if (renewLinks.length === 0) {
      renewResults.push({ serverId: server.id, status: 'no_links', message: '无续期链接' });
      continue;
    }

    const availableLinks = renewLinks.filter(l => l.claimed === false);
    const linksToTry = availableLinks.length > 0 ? availableLinks : renewLinks;
    console.log(`可用链接: ${availableLinks.length}, 将尝试: ${linksToTry.length}`);

    let hasSuccess = false, hasFail = false;
    let claimedCount = 0, successCount = 0;
    const failMessages = [];

    for (let i = 0; i < linksToTry.length; i++) {
      const linkObj = linksToTry[i];
      const linkUrl = typeof linkObj === 'string' ? linkObj : (linkObj.link || linkObj);
      console.log(`尝试链接 ${i + 1}/${linksToTry.length}: ${linkUrl}`);
      try {
        const result = await renewServer(authData.token, server.id, linkUrl);
        console.log(`结果: ${result.message}`);
        if (result.success) {
          hasSuccess = true;
          successCount++;
        } else if (result.alreadyClaimed) {
          claimedCount++;
        } else {
          hasFail = true;
          failMessages.push(result.message);
        }
      } catch (error) {
        console.error(`续期异常:`, error.message);
        hasFail = true;
        failMessages.push(error.message);
      }
      await delay(500);
    }

    if (hasSuccess) {
      renewResults.push({ serverId: server.id, status: 'success', message: `续期成功(${successCount}/${linksToTry.length})` });
    } else if (claimedCount === linksToTry.length || (claimedCount > 0 && !hasFail)) {
      renewResults.push({ serverId: server.id, status: 'claimed', message: '广告冷却中' });
    } else if (hasFail) {
      renewResults.push({ serverId: server.id, status: 'fail', message: failMessages.join('; ') });
    }
  }

  await delay(1000);
  try {
    servers = await getServers(authData.token);
  } catch (e) {
    console.error('获取续期后状态失败:', e.message);
  }

  return {
    email: account.email,
    mode: 'renew',
    error: null,
    servers: servers.map(s => {
      const before = beforeState[s.id] || {};
      return { id: s.id, ip: s.ip || before.ip, status: s.status, expiry: s.expiry, beforeExpiry: before.expiry };
    }),
    renewResults,
    restartResults: []
  };
}

// ==================== 重启逻辑 ====================
async function processAccountRestart(account) {
  const authData = await login(account.email, account.password);
  if (!authData.token) throw new Error('登录失败');
  console.log(`账号 ${account.email} 登录成功`);

  const servers = await getServers(authData.token);
  console.log(`获取到 ${servers.length} 个服务器`);

  const restartResults = [];
  for (const server of servers) {
    console.log(`服务器 ${server.id} (IP: ${server.ip || 'N/A'}) 重启中...`);
    try {
      const redeployResult = await redeployServer(authData.token, server.id);
      restartResults.push({
        serverId: server.id,
        ip: server.ip,
        success: redeployResult.success,
        message: redeployResult.message
      });
      console.log(`重启: ${redeployResult.success ? '成功' : '失败'} - ${redeployResult.message}`);
    } catch (error) {
      console.error(`重启失败:`, error.message);
      restartResults.push({
        serverId: server.id,
        ip: server.ip,
        success: false,
        message: error.message
      });
    }
  }

  return {
    email: account.email,
    mode: 'restart',
    error: null,
    servers: servers.map(s => ({ id: s.id, ip: s.ip, status: s.status, expiry: s.expiry })),
    renewResults: [],
    restartResults
  };
}

// ==================== 通知格式 ====================
function formatNotification(result, mode) {
  const lines = [];
  const now = new Date();
  if (mode === 'renew') {
    lines.push('📋 PellaFree 续期报告');
  } else {
    lines.push('🔄 PellaFree 重启报告');
  }
  lines.push('');
  lines.push(`账号: ${escapeHtml(result.email)}`);

  if (result.error) {
    lines.push(`❌ 错误: ${escapeHtml(result.error)}`);
    lines.push('');
    lines.push('PellaFree Auto Renewal');
    return lines.join('\n');
  }

  if (mode === 'renew') {
    if (result.servers.length === 0) {
      lines.push('暂无服务器');
    } else {
      for (const server of result.servers) {
        const statusText = server.status === 'running' ? '运行中' : (server.status === 'stopped' ? '已关机' : server.status || '未知');
        lines.push(`${statusText} | IP: ${server.ip || 'N/A'}`);
        const afterRemaining = calcRemaining(server.expiry, now);
        if (server.beforeExpiry && server.beforeExpiry !== server.expiry) {
          const beforeRemaining = calcRemaining(server.beforeExpiry, now);
          lines.push(`剩余: ${beforeRemaining} → ${afterRemaining}`);
        } else {
          lines.push(`剩余: ${afterRemaining}`);
        }
      }
      const successResults = result.renewResults.filter(r => r.status === 'success');
      const claimedResults = result.renewResults.filter(r => r.status === 'claimed');
      const failResults = result.renewResults.filter(r => r.status === 'fail');

      if (successResults.length > 0) {
        lines.push(`续期: ✅成功`);
      } else if (claimedResults.length > 0 && failResults.length === 0) {
        lines.push(`续期: 广告冷却中`);
      } else if (failResults.length > 0) {
        lines.push(`续期: ❌失败`);
        for (const r of failResults) {
          lines.push(`  ↳ ${escapeHtml(r.message)}`);
        }
      } else {
        lines.push(`续期: 无可用广告`);
      }
    }
  }

  if (mode === 'restart') {
    if (result.restartResults.length === 0) {
      lines.push('暂无服务器可重启');
    } else {
      for (const r of result.restartResults) {
        const icon = r.success ? '✅' : '❌';
        const statusText = r.success ? '重启成功' : '重启失败';
        lines.push(`${icon} ${statusText} | IP: ${r.ip || 'N/A'}`);
        if (!r.success) {
          lines.push(`  原因: ${escapeHtml(r.message)}`);
        }
      }
      const successCount = result.restartResults.filter(r => r.success).length;
      lines.push(`本次: ${successCount}/${result.restartResults.length} 成功`);
    }
  }

  lines.push('');
  lines.push('PellaFree Auto Renewal');
  return lines.join('\n');
}

// ==================== Telegram ====================
async function sendTG(env, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: text })
    });
    const data = await response.json();
    if (!data.ok) console.error('Telegram API 错误:', JSON.stringify(data));
  } catch (error) {
    console.error('Telegram 发送异常:', error);
  }
}

// ==================== 重启 API ====================
async function redeployServer(token, serverId) {
  const bodyParams = new URLSearchParams({ id: serverId });
  const response = await fetch('https://api.pella.app/server/redeploy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.pella.app',
      'Referer': 'https://www.pella.app/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: bodyParams.toString()
  });

  if (!response.ok) {
    return { success: false, message: `HTTP异常 ${response.status}` };
  }
  const responseText = await response.text();
  if (!responseText) {
    return { success: true, message: '重启指令已发送' };
  }
  try {
    const data = JSON.parse(responseText);
    if (data.success || data.message === 'success' || response.status === 200) {
      return { success: true, message: '重启指令已发送' };
    }
    if (data.error) return { success: false, message: data.error };
    return { success: false, message: '未知响应' };
  } catch {
    return { success: true, message: '重启指令已发送' };
  }
}

// ==================== 续期 API ====================
async function renewServer(token, serverId, renewLink) {
  const linkId = renewLink.split('/renew/')[1];
  if (!linkId) return { success: false, alreadyClaimed: false, message: '无效链接' };

  const response = await fetch(`https://api.pella.app/server/renew?id=${linkId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://www.pella.app',
      'Referer': `https://pella.app/renew/${linkId}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: '{}'
  });
  const responseText = await response.text();
  console.log(`续期API响应: ${response.status} ${responseText}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { success: false, alreadyClaimed: false, message: `解析失败` };
  }

  if (data.success) return { success: true, alreadyClaimed: false, message: '续期成功' };
  if (data.error === 'Already claimed' || (data.message && data.message.includes('Already claimed'))) {
    return { success: false, alreadyClaimed: true, message: 'Already claimed' };
  }
  if (data.error) return { success: false, alreadyClaimed: false, message: data.error };
  return { success: false, alreadyClaimed: false, message: '未知响应' };
}

// ==================== 公共函数 ====================
function parseAccounts(accountStr) {
  if (!accountStr) return [];
  return accountStr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.includes('-----'))
    .map(line => {
      const [email, password] = line.split('-----').map(s => s.trim());
      return { email, password };
    })
    .filter(acc => acc.email && acc.password);
}

async function login(email, password) {
  const CLERK_API_VERSION = '2025-11-10';
  const CLERK_JS_VERSION = '5.125.3';
  const signInResponse = await fetch(`https://clerk.pella.app/v1/client/sign_ins?__clerk_api_version=${CLERK_API_VERSION}&_clerk_js_version=${CLERK_JS_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.pella.app',
      'Referer': 'https://www.pella.app/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: new URLSearchParams({ locale: 'zh-CN', identifier: email, password, strategy: 'password' }).toString()
  });

  if (!signInResponse.ok) {
    throw new Error(`登录失败: HTTP ${signInResponse.status}`);
  }
  const signInData = await signInResponse.json();
  let sessionId = signInData.response?.created_session_id;
  let token = null;

  if (signInData.client?.sessions?.length > 0) {
    const session = signInData.client.sessions[0];
    sessionId = sessionId || session.id;
    token = session.last_active_token?.jwt;
  }
  const cookies = signInResponse.headers.get('set-cookie') || '';
  const clientCookie = extractCookie(cookies, '__client');
  if (token) return { token, sessionId, clientCookie };

  if (sessionId) {
    const touchResponse = await fetch(`https://clerk.pella.app/v1/client/sessions/${sessionId}/touch?__clerk_api_version=${CLERK_API_VERSION}&_clerk_js_version=${CLERK_JS_VERSION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.pella.app',
        'Referer': 'https://www.pella.app/',
        'Cookie': clientCookie ? `__client=${clientCookie}` : '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: 'active_organization_id='
    });
    if (touchResponse.ok) {
      const touchData = await touchResponse.json();
      token = touchData.sessions?.[0]?.last_active_token?.jwt || touchData.last_active_token?.jwt;
    }
  }

  if (!token && sessionId) {
    const tokensResponse = await fetch(`https://clerk.pella.app/v1/client/sessions/${sessionId}/tokens?__clerk_api_version=${CLERK_API_VERSION}&_clerk_js_version=${CLERK_JS_VERSION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.pella.app',
        'Referer': 'https://www.pella.app/',
        'Cookie': clientCookie ? `__client=${clientCookie}` : '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: ''
    });
    if (tokensResponse.ok) {
      const tokensData = await tokensResponse.json();
      token = tokensData.jwt;
    }
  }

  if (!token) throw new Error('登录成功但无法获取 token');
  return { token, sessionId, clientCookie };
}

async function getServers(token) {
  const response = await fetch('https://api.pella.app/user/servers', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://www.pella.app',
      'Referer': 'https://www.pella.app/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  if (!response.ok) throw new Error(`获取服务器列表失败: ${response.status}`);
  const data = await response.json();
  return data.servers || [];
}

function calcRemaining(expiry, now) {
  if (!expiry) return 'N/A';
  try {
    const match = expiry.match(/(\d{2}):(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return 'N/A';
    const [, hour, minute, second, day, month, year] = match;
    const expiryDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const diff = expiryDate.getTime() - now.getTime();
    if (diff <= 0) return '已过期';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}天${hours}时${minutes}分`;
    if (hours > 0) return `${hours}时${minutes}分`;
    return `${minutes}分`;
  } catch {
    return 'N/A';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// ==================== 前端 HTML ====================
function generateHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PellaFree 管理面板</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);min-height:100vh;display:flex;justify-content:center;align-items:center;color:#fff}
.container{background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:40px;width:420px;max-width:90vw;box-shadow:0 25px 50px rgba(0,0,0,0.3)}
.logo{text-align:center;margin-bottom:30px}
.logo h1{font-size:28px;background:linear-gradient(90deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:5px}
.logo p{color:rgba(255,255,255,0.5);font-size:14px}
.input-group{margin-bottom:20px}
.input-group label{display:block;margin-bottom:8px;font-size:14px;color:rgba(255,255,255,0.7)}
.input-group input{width:100%;padding:12px 16px;border:1px solid rgba(255,255,255,0.15);border-radius:12px;background:rgba(255,255,255,0.08);color:#fff;font-size:15px;outline:none;transition:border-color 0.3s}
.input-group input:focus{border-color:#667eea}
.input-group input::placeholder{color:rgba(255,255,255,0.3)}
.btn-group{display:flex;gap:12px;margin-top:25px}
.btn{flex:1;padding:14px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;gap:8px}
.btn-renew{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
.btn-renew:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(102,126,234,0.4)}
.btn-restart{background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff}
.btn-restart:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(245,87,108,0.4)}
.btn:disabled{opacity:0.5;cursor:not-allowed;transform:none!important}
.result{margin-top:20px;padding:14px;border-radius:12px;font-size:14px;display:none;word-break:break-all}
.result.success{background:rgba(72,199,142,0.15);border:1px solid rgba(72,199,142,0.3);color:#48c78e}
.result.error{background:rgba(245,87,108,0.15);border:1px solid rgba(245,87,108,0.3);color:#f5576c}
.divider{height:1px;background:rgba(255,255,255,0.1);margin:25px 0}
.section-title{font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:15px}
</style>
</head>
<body>
<div class="container">
<div class="logo">
<h1>🚀 PellaFree</h1>
<p>自动续期 & 重启管理面板</p>
</div>
<div class="input-group">
<label>🔑 访问密码</label>
<input type="password" id="pwd" placeholder="请输入密码" autocomplete="off">
</div>
<div class="divider"></div>
<div class="section-title">续期操作</div>
<div class="btn-group">
<button class="btn btn-renew" onclick="doAction('renew')">📋 执行续期</button>
</div>
<div class="divider"></div>
<div class="section-title">重启操作</div>
<div class="input-group">
<label>📧 指定账号（留空则重启所有）</label>
<input type="text" id="account" placeholder="user@example.com（可选）">
</div>
<div class="btn-group">
<button class="btn btn-restart" onclick="doAction('restart')">🔄 执行重启</button>
</div>
<div class="result" id="result"></div>
</div>
<script>
async function doAction(mode){
const pwd=document.getElementById('pwd').value.trim();
if(!pwd){showResult('请输入访问密码',false);return}
const btns=document.querySelectorAll('.btn');
btns.forEach(b=>b.disabled=true);
let url='';
if(mode==='renew'){
url='/?pwd='+encodeURIComponent(pwd);
}else{
const account=document.getElementById('account').value.trim();
url='/restart?pwd='+encodeURIComponent(pwd);
if(account)url+='&account='+encodeURIComponent(account);
}
try{
const res=await fetch(url);
const data=await res.json();
showResult(data.message,data.success);
}catch(e){
showResult('请求失败: '+e.message,false);
}finally{
btns.forEach(b=>b.disabled=false);
}
}
function showResult(msg,success){
const el=document.getElementById('result');
el.textContent=msg;
el.className='result '+(success?'success':'error');
el.style.display='block';
}
document.getElementById('pwd').addEventListener('keydown',function(e){
if(e.key==='Enter')doAction('renew');
});
</script>
</body>
</html>`;
}
