const hotkeyInput        = document.getElementById('hotkeyInput');
const langSelect         = document.getElementById('langSelect');
const apiKeyInput        = document.getElementById('apiKeyInput');
const autoLaunchCheckbox = document.getElementById('autoLaunchCheckbox');
const startupModeSelect  = document.getElementById('startupModeSelect');
const usageInfo          = document.getElementById('usageInfo');
const historyArea        = document.getElementById('historyArea');
const clearBtn           = document.getElementById('clearHistoryBtn');
const limitInput         = document.getElementById('historyLimitInput');

let isRecording = false;
let historyLimit = 100;

window.onload = async () => {
  const config = await window.electronAPI.invoke('get-config');
  if (config) {
    hotkeyInput.value          = config.hotkey;
    langSelect.value           = config.targetLang;
    apiKeyInput.value          = config.deeplApiKey;
    autoLaunchCheckbox.checked = config.autoLaunch;
    startupModeSelect.value    = config.startupMode;
    historyLimit               = config.historyLimit;
    limitInput.value           = historyLimit;
  }

  hotkeyInput.addEventListener('focus', async () => {
    isRecording = true;
    await window.electronAPI.invoke('pause-hotkey');
    hotkeyInput.value = '正在录制，请按组合键';
  });

  hotkeyInput.addEventListener('keydown', async e => {
    if (!isRecording) return;
    e.preventDefault(); e.stopPropagation();
    const mods = [];
    if (e.ctrlKey)  mods.push('Control');
    if (e.shiftKey) mods.push('Shift');
    if (e.altKey)   mods.push('Alt');
    if (e.metaKey)  mods.push('Super');
    const mainKey = e.code.replace('Key','').toUpperCase();
    if (!['CONTROL','SHIFT','ALT','META','SUPER'].includes(mainKey)) mods.push(mainKey);
    if (mods.length >= 2) {
      hotkeyInput.value = mods.join('+');
      await saveConfig();
      isRecording = false;
      await window.electronAPI.invoke('resume-hotkey');
      hotkeyInput.blur();
    }
  });

  langSelect.addEventListener('change', saveConfig);
  apiKeyInput.addEventListener('change', async ()=>{
    await saveConfig();
    queryAndShowUsage();
  });
  autoLaunchCheckbox.addEventListener('change', saveConfig);
  startupModeSelect.addEventListener('change', saveConfig);
  limitInput.addEventListener('change', async ()=>{
    historyLimit = parseInt(limitInput.value,10) || 100;
    await saveConfig();
    loadHistory();
  });
  clearBtn.addEventListener('click', async () => {
    await window.electronAPI.invoke('clear-history');
    loadHistory();
  });

  window.electronAPI.on('history-updated', loadHistory);
  window.electronAPI.on('usage-updated', (_, usage) => {
    usageInfo.textContent = usage
      ? `本月使用: ${usage.character_count} / ${usage.character_limit}`
      : '额度查询失败';
  });
  window.electronAPI.on('hotkey-updated', (_,hk)=>hotkeyInput.value=hk);

  loadHistory();
  queryAndShowUsage();
  setInterval(queryAndShowUsage,5*60*1000);
};

async function saveConfig() {
  const cfg = {
    hotkey:       hotkeyInput.value.trim(),
    targetLang:   langSelect.value,
    deeplApiKey:  apiKeyInput.value.trim(),
    autoLaunch:   autoLaunchCheckbox.checked,
    startupMode:  startupModeSelect.value,
    historyLimit: historyLimit
  };
  await window.electronAPI.invoke('update-config', cfg);
}

async function queryAndShowUsage() {
  const key = apiKeyInput.value.trim();
  const usage = await window.electronAPI.invoke('get-usage', key);
  usageInfo.textContent = usage
    ? `本月使用: ${usage.character_count} / ${usage.character_limit}`
    : '额度查询失败';
}

async function loadHistory() {
  const txt   = await window.electronAPI.invoke('get-history');
  const lines = txt.trim().split('\n').slice(-historyLimit);
  historyArea.innerHTML = lines.map(line => {
    const m = line.match(/^\[(.*?)\] (.*?) => (.*)$/);
    if (!m) return '';
    return `
      <div class="history-item">
        <div class="time">[${m[1]}]</div>
        <div class="original">${m[2]}</div>
        <div class="translated">➡️ ${m[3]}</div>
        <div class="actions">
          <button class="copy-btn"  data-text="${m[3]}">复制译文</button>
          <button class="delete-btn" data-line="${line}">删除</button>
        </div>
      </div>`;
  }).join('');
  historyArea.scrollTop = historyArea.scrollHeight;

  document.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click',async ()=>{
      await window.electronAPI.invoke('copy-to-clipboard',btn.dataset.text);
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn=>{
    btn.addEventListener('click',async ()=>{
      await window.electronAPI.invoke('delete-history-item',btn.dataset.line);
      loadHistory();
    });
  });
}
