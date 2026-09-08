const reasons = {
  dns: '无法解析官网地址，请检查网络或 DNS 设置。',
  tls: '网站安全证书校验失败，已停止连接。请检查系统时间或稍后重试，不要关闭证书验证。',
  timeout: '连接超时，请检查网络后重试。',
  network: '连接未完成，可能是网络或服务暂不可用。请稍后重试。',
  crash: '页面进程重复异常，已停止自动重载。可尝试重新连接或重新打开客户端。',
  engine: '无法初始化安全的浏览器环境，请更新 WebView2 后重新打开客户端。',
}
let timer
function render() {
  clearTimeout(timer)
  const code = window.location.hash.slice(1)
  const reason = Object.hasOwn(reasons, code) ? reasons[code] : undefined
  document.getElementById('title').textContent = reason ? '暂时无法打开 Chevoink' : '正在连接 Chevoink'
  document.getElementById('detail').textContent = reason || '正在安全地连接创作空间，请稍候。'
  document.getElementById('progress').hidden = Boolean(reason)
  if (!reason) timer = setTimeout(() => {
    document.getElementById('detail').textContent = '连接时间较长，可检查网络后重试，或通过窗口菜单在浏览器打开官网。'
  }, 15000)
}
window.addEventListener('hashchange', render)
render()
