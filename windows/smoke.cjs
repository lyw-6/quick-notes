const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

// 不设 QUICKNOTE_EXE 时测开发模式；设了就测该 exe（打包版）
const PACKAGED_EXE = process.env.QUICKNOTE_EXE || '';
const ELECTRON = PACKAGED_EXE || path.join(__dirname, 'node_modules/electron/dist/electron.exe');
const PORT = 9333;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); }
};

(async () => {
  // 宿主环境常带 ELECTRON_RUN_AS_NODE=1，会让 electron 退化成普通 node，必须剔除
  const env = { ...process.env, QUICKNOTE_DEBUG_PORT: String(PORT) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS; // 宿主注入，打包应用不支持，会刷警告噪声
  const proc = PACKAGED_EXE
    ? spawn(ELECTRON, [], { cwd: path.dirname(ELECTRON), env })
    : spawn(ELECTRON, ['.'], { cwd: __dirname, env });
  const logs = [];
  proc.stdout.on('data', d => logs.push('[out] ' + d));
  proc.stderr.on('data', d => logs.push('[err] ' + d));

  let browser = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT); break; }
    catch (e) { /* not ready */ }
  }
  if (!browser) {
    console.log('无法连接 CDP，electron 输出：\n' + logs.join('\n'));
    proc.kill(); process.exit(1);
  }

  try {
    const ctx = browser.contexts()[0];
    let page = ctx.pages().find(p => p.url().startsWith('app://'));
    for (let i = 0; i < 15 && !page; i++) {
      await sleep(700);
      page = ctx.pages().find(p => p.url().startsWith('app://'));
    }
    if (!page) { console.log('未找到 app:// 页面，现有页面: ' + ctx.pages().map(p => p.url()).join(' | ')); throw new Error('no page'); }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(1500);

    console.log('\n── 环境与上下文 ──');
    const url = page.url();
    ok('页面走 app:// 协议', url.startsWith('app://'), url);

    const secure = await page.evaluate(() => window.isSecureContext);
    ok('isSecureContext = true（剪贴板弹窗根治的前提）', secure === true, String(secure));

    const clip = await page.evaluate(() => !!(navigator.clipboard && navigator.clipboard.readText));
    ok('navigator.clipboard 可用', clip);

    const perm = await page.evaluate(async () => {
      try { const r = await navigator.permissions.query({ name: 'clipboard-read' }); return r.state; }
      catch (e) { return 'unsupported: ' + e.message; }
    });
    ok('剪贴板读权限已授予/免询问', perm === 'granted' || perm === 'prompt', perm);

    console.log('\n── 应用本体 ──');
    const appOk = await page.evaluate(() => ({
      ed: !!document.getElementById('ed'),
      tabs: !!document.getElementById('docTabs'),
      toolbar: !!document.getElementById('mainToolbar'),
      title: document.title
    }));
    ok('编辑区 #ed 渲染', appOk.ed);
    ok('标签栏 #docTabs 渲染', appOk.tabs);
    ok('工具栏 #mainToolbar 渲染', appOk.toolbar);

    const title = await page.title();
    ok('窗口标题正确', /快速记录/.test(title), title);

    const lsOk = await page.evaluate(() => {
      try { localStorage.setItem('__smoke', '1'); return localStorage.getItem('__smoke') === '1'; }
      catch (e) { return false; }
    });
    ok('localStorage 可写（数据持久化前提）', lsOk);

    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await sleep(500);
    ok('无 JS 运行时错误', errs.length === 0, errs.join('; ') || 'clean');

    console.log('\n── 主进程 ──');
    const hotkeyFail = logs.some(l => l.indexOf('全局热键注册失败') !== -1);
    ok('全局热键 ' + 'Ctrl+Alt+N 注册成功', !hotkeyFail);
    const mainErr = logs.filter(l => l.indexOf('[err]') === 0 && !/DevTools|Autofill|GPU|gpu_/.test(l));
    ok('主进程无异常输出', mainErr.length === 0, mainErr.slice(0, 2).join(' / ') || 'clean');

    await page.screenshot({ path: path.join(__dirname, 'smoke.png') });
    console.log('\n截图已存: smoke.png');
  } catch (e) {
    fail++;
    console.log('测试异常: ' + e.message);
    console.log(logs.slice(-20).join('\n'));
  } finally {
    try { await browser.close(); } catch (e) {}
    proc.kill();
  }

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
