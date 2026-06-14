// ==========================================
// 駅ロケ専用 管理者パネル (admin.js)
// ==========================================

const adminPanel = document.createElement('div');
adminPanel.id = 'admin-panel';
adminPanel.style.padding = '10px';
adminPanel.style.background = '#e3f2fd';
adminPanel.style.border = '2px solid #2196f3';
adminPanel.style.marginBottom = '15px';

// 【修正】エンドレスモードの答え表示枠と、全ボタンへの枠線（border: 2px solid）の追加
adminPanel.innerHTML = `
<span style="color:#000000;"><b>🛠 駅ロケ 管理者モード</b><br>
現在の答え: [通常] <span id="debug-ans-normal">（読込中...）</span> / [ハード] <span id="debug-ans-hard">（読込中...）</span><br>
[エンドレス] <span id="debug-ans-endless" style="color:#e65100;">（未開始/読込中...）</span></span><br>
<input type="text" id="admin-custom-ans" placeholder="新しい答え(駅名/ひらがな)" style="padding:4px; margin-right:5px; margin-top:5px; width:180px; border:2px solid #9e9e9e; border-radius:4px;">
<button id="admin-set-normal-btn" style="margin-right:5px; background:#4caf50; color:#fff; border:2px solid #2e7d32; padding:4px 8px; border-radius:4px; font-weight:bold;">通常を変更</button>
<button id="admin-set-hard-btn" style="margin-right:5px; background:#e74c3c; color:#fff; border:2px solid #c0392b; padding:4px 8px; border-radius:4px; font-weight:bold;">ハードを変更</button>
<button id="admin-reset-btn" style="margin-right:5px; border:2px solid #9e9e9e; background:#f5f5f5; color:#333; padding:4px 8px; border-radius:4px; font-weight:bold;">盤面リセット</button>
<button id="admin-stats-wipe-btn" style="background-color:#ffe6e6; color:#c62828; border:2px solid #c62828; padding:4px 8px; border-radius:4px; font-weight:bold;">戦績全消去</button>
<button id="admin-full-wipe-btn" style="background-color:#b71c1c; color:#fff; border:2px solid #7f0000; margin-left:5px; padding:4px 8px; border-radius:4px; font-weight:bold;">データ完全消去</button>

<div style="margin-top:10px; padding:10px; background:#fff3e0; border:2px solid #ff9800; border-radius:4px;">
<span style="color:black;"><b>【全データ一覧＆直接編集】</b></span><br>
<button id="adm-load-all-btn" style="margin-bottom:10px; padding:4px 8px; background:#fff; border:2px solid #ff9800; border-radius:4px; font-weight:bold; color:#e65100;">全データを読み込んで表示</button>
<div id="adm-all-data-container" style="max-height:400px; overflow-y:auto; background:#fff; padding:5px; border:1px solid #ccc; font-size:12px; color:#333;">ここにデータが表示されます</div>
</div>

<div style="margin-top:10px; padding:10px; background:#f5f5f5; border:2px solid #bdbdbd; border-radius:4px; font-size:12px; color:black; text-align:left;">
<b>【各種カウンター手動編集】</b><br>
図鑑解放数: <input type="text" id="adm-unlocked-count" style="width:50px; background:#e0e0e0; border:1px solid #ccc;" readonly> 駅<br>
連続ログイン: <input type="number" id="adm-cur-login-streak" style="width:60px; border:1px solid #ccc;"> 日 <button id="adm-save-login" style="border:2px solid #9e9e9e; border-radius:4px;">保存</button><br>
通常最高連勝: <input type="number" id="adm-normal-max-streak" style="width:60px; border:1px solid #ccc;"> 回 <button id="adm-save-normal-streak" style="border:2px solid #9e9e9e; border-radius:4px;">保存</button><br>
エンドレスハイスコア: <input type="number" id="adm-endless-high-score" style="width:100px; border:1px solid #ccc;"> pts <button id="adm-save-endless-score" style="border:2px solid #9e9e9e; border-radius:4px;">保存</button><br>
エンドレス最高コンボ: <input type="number" id="adm-endless-max-combo" style="width:60px; border:1px solid #ccc;"> 回 <button id="adm-save-endless-combo" style="border:2px solid #9e9e9e; border-radius:4px;">保存</button><br>
</div>

<div style="margin-top:10px; padding-top:10px; border-top:1px solid #ccc;">
<select id="admin-event-select" style="padding:4px; border:2px solid #9e9e9e; border-radius:4px;">
<option value="">通常（演出オフ）</option>
<option value="newyear">正月（🎍）</option>
<option value="valentine">バレンタイン（🍫）</option>
<option value="hinamatsuri">ひなまつり（🌸）</option>
<option value="kodomo">こどもの日（🎏）</option>
<option value="site_anniversary">サイト周年（🎉）</option>
<option value="tanabata">七夕（🎋）</option>
<option value="halloween">ハロウィン（🎃）</option>
<option value="christmas">クリスマス（🎄）</option>
<option value="nye">大晦日（🔔）</option>
</select>
<button id="admin-event-btn" style="padding:4px 8px; border:2px solid #9e9e9e; border-radius:4px; font-weight:bold; background:#fff;">演出テスト</button>
<br>
<button id="admin-offline-banner-btn" style="background:#fff3e0; border:2px solid #ff9800; margin-top:10px; padding:4px 8px; border-radius:4px; font-weight:bold; color:#e65100;">⚠️ オフライン警告バナーをテスト表示 (ON/OFF)</button>
</div>
`;

const headerEl = document.querySelector('header');
if (headerEl) headerEl.insertAdjacentElement('afterend', adminPanel);
else document.body.prepend(adminPanel);

// 答えの監視処理（エンドレスの答え表示を追加）
setInterval(() => {
  if (typeof todayLocaStationNormal !== 'undefined' && todayLocaStationNormal) {
    document.getElementById('debug-ans-normal').textContent = todayLocaStationNormal.kanji;
  }
  if (typeof todayLocaStationHard !== 'undefined' && todayLocaStationHard) {
    document.getElementById('debug-ans-hard').textContent = todayLocaStationHard.kanji;
  }
  // エンドレスモードの答えを表示
  if (typeof locaEndlessState !== 'undefined' && locaEndlessState.currentStation) {
    document.getElementById('debug-ans-endless').textContent = locaEndlessState.currentStation.kanji;
  } else if (typeof todayLocaStation !== 'undefined' && todayLocaStation && typeof currentDifficulty !== 'undefined' && currentDifficulty === 'endless') {
    document.getElementById('debug-ans-endless').textContent = todayLocaStation.kanji;
  }
}, 500);

// リセット・消去処理群
const resetLocaPlay = () => {
  localStorage.removeItem("ekiLocateStateV2");
  localStorage.removeItem("ekiLocateEndlessDeck");
};

document.getElementById('admin-set-normal-btn').addEventListener('click', () => {
  const newAns = document.getElementById('admin-custom-ans').value.trim();
  if (newAns !== '') {
    const found = locaStations.find(s => s.kanji === newAns || s.hiragana === newAns);
    if (!found) { alert('エラー：その駅は見つかりません。'); return; }
    sessionStorage.setItem('admin_override_ans_normal', found.kanji);
    resetLocaPlay(); alert('通常モードの答えを変更しました。'); location.reload();
  }
});
document.getElementById('admin-set-hard-btn').addEventListener('click', () => {
  const newAns = document.getElementById('admin-custom-ans').value.trim();
  if (newAns !== '') {
    const found = locaStations.find(s => s.kanji === newAns || s.hiragana === newAns);
    if (!found) { alert('エラー：その駅は見つかりません。'); return; }
    sessionStorage.setItem('admin_override_ans_hard', found.kanji);
    resetLocaPlay(); alert('ハードモードの答えを変更しました。'); location.reload();
  }
});
document.getElementById('admin-reset-btn').addEventListener('click', () => { resetLocaPlay(); location.reload(); });
document.getElementById('admin-stats-wipe-btn').addEventListener('click', () => {
  if (confirm('戦績データのみを初期化します。よろしいですか？')) {
    localStorage.removeItem('ekiLocateStatsV2');
    localStorage.removeItem('ekiLocateEndlessHighScore');
    localStorage.removeItem('ekiLocateEndlessMaxCombo');
    location.reload();
  }
});
document.getElementById('admin-full-wipe-btn').addEventListener('click', () => {
  if (confirm('すべてのデータを完全に消去します。本当によろしいですか？')) {
    localStorage.clear(); sessionStorage.clear();
    alert('消去しました。'); location.reload();
  }
});

// 全データ編集
document.getElementById('adm-load-all-btn').addEventListener('click', () => {
  const container = document.getElementById('adm-all-data-container');
  container.innerHTML = '';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('ekiLocate')) {
      let val = localStorage.getItem(key);
      let displayVal = val;
      try { displayVal = JSON.stringify(JSON.parse(val), null, 2); } catch(e) {}
      const block = document.createElement('div');
      block.style.marginBottom = '15px';
      block.style.borderBottom = '1px dashed #ccc';
      block.style.paddingBottom = '10px';
      block.innerHTML = `
        <div style="font-weight:bold; color:#1976d2; margin-bottom:5px;">${key}</div>
        <textarea id="edit-${key}" style="width:100%; height:100px; font-family:monospace; font-size:12px; margin-bottom:5px; border:1px solid #ccc;">${displayVal}</textarea>
        <div style="text-align:right;">
          <button id="save-${key}" style="background-color:#e3f2fd; color:#1565c0; padding:4px 10px; border:2px solid #1976d2; border-radius:4px; font-weight:bold;">上書き保存</button>
        </div>
      `;
      container.appendChild(block);
      document.getElementById(`save-${key}`).addEventListener('click', () => {
        try { localStorage.setItem(key, document.getElementById(`edit-${key}`).value); alert("保存しました。"); } catch(e) { alert("エラー"); }
      });
    }
  }
});

// カウンター手動保存
setTimeout(() => {
  let metaData = JSON.parse(localStorage.getItem("ekiLocateMeta") || '{"consecutiveLoginDays":0, "unlockedStations":[]}');
  let statsData = JSON.parse(localStorage.getItem("ekiLocateStatsV2") || '{"normal":{"maxStreak":0}}');
  document.getElementById("adm-unlocked-count").value = metaData.unlockedStations ? metaData.unlockedStations.length : 0;
  document.getElementById("adm-cur-login-streak").value = metaData.consecutiveLoginDays || 0;
  document.getElementById("adm-normal-max-streak").value = (statsData.normal && statsData.normal.maxStreak) ? statsData.normal.maxStreak : 0;
  document.getElementById("adm-endless-high-score").value = parseInt(localStorage.getItem("ekiLocateEndlessHighScore") || "0", 10);
  document.getElementById("adm-endless-max-combo").value = parseInt(localStorage.getItem("ekiLocateEndlessMaxCombo") || "0", 10);
  
  const bindSave = (btnId, action) => document.getElementById(btnId).addEventListener("click", () => { action(); alert("保存しました。"); location.reload(); });
  bindSave("adm-save-login", () => { metaData.consecutiveLoginDays = parseInt(document.getElementById("adm-cur-login-streak").value, 10)||0; localStorage.setItem("ekiLocateMeta", JSON.stringify(metaData)); });
  bindSave("adm-save-normal-streak", () => { if (!statsData.normal) statsData.normal={}; statsData.normal.maxStreak = parseInt(document.getElementById("adm-normal-max-streak").value, 10)||0; localStorage.setItem("ekiLocateStatsV2", JSON.stringify(statsData)); });
  bindSave("adm-save-endless-score", () => localStorage.setItem("ekiLocateEndlessHighScore", document.getElementById("adm-endless-high-score").value));
  bindSave("adm-endless-max-combo", () => localStorage.setItem("ekiLocateEndlessMaxCombo", document.getElementById("adm-endless-max-combo").value));
}, 500);

// 演出テスト
document.getElementById('admin-event-btn').addEventListener('click', () => {
  const ev = document.getElementById('admin-event-select').value;
  const nYear = document.getElementById('admin-site-anni-year').value;

  // サイト周年の場合は、入力された「n」の数字をセッションに記憶させます
  if (ev === "site_anniversary") {
    sessionStorage.setItem("debug_site_anni_year", nYear);
  }
  
  // 第二引数に true を渡すことで、強制的に再生させます
  if (typeof triggerLocaEvent === "function") triggerLocaEvent(ev, true);
});
document.getElementById('admin-offline-banner-btn').addEventListener('click', () => {
  const existing = document.getElementById("offline-warning-banner");
  if (existing) existing.remove();
  else document.querySelector("header")?.insertAdjacentHTML("afterbegin", `<div id="offline-warning-banner" style="background-color:#fff3e0; color:#e65100; font-size:11px; font-weight:bold; text-align:center; padding:6px; border-bottom:1px solid #ffcc80;">⚠️ [テスト] オフラインバナー表示</div>`);
});
