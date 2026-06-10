const adminPanel=document.createElement('div');
adminPanel.id='admin-panel';
adminPanel.style.padding='10px';
adminPanel.style.background='#ffebee';
adminPanel.style.border='2px solid #f44336';
adminPanel.style.marginBottom='15px';
adminPanel.innerHTML=`
<span style="color:#000000;"><b>🛠 管理者モード</b><br>
現在の答え: <span id="debug-ans-text">（読込中...）</span></span><br>
<input type="text" id="admin-custom-ans" placeholder="新しい答え(ひらがな)" style="padding:4px;margin-right:5px;">
<button id="admin-set-btn" style="margin-right:5px;">確定変更</button>
<button id="admin-rand-btn" style="margin-right:5px;">ランダム変更</button>
<button id="admin-reset-btn" style="margin-right:5px;" title="成績や図鑑はそのままに、盤面だけをやり直します">盤面リセット</button>
<button id="admin-stats-wipe-btn" style="background-color:#ffe6e6; color:#c62828; border:1px solid #c62828;">戦績全消去</button>
<button id="admin-full-wipe-btn" style="background-color:#b71c1c; color:#fff; border:1px solid #b71c1c; margin-left:5px;">データ完全消去</button>

<div style="margin-top:10px; padding:10px; background:#fff3e0; border:1px solid #ff9800; border-radius:4px;">
<span style="color:black";><b>【全データ一覧＆直接編集】</b></span><br>
<button id="adm-load-all-btn" style="margin-bottom:10px; padding:4px 8px;">全データを読み込んで表示</button>
<div id="adm-all-data-container" style="max-height:400px; overflow-y:auto; background:#fff; padding:5px; border:1px solid #ccc; font-size:12px; color:#333;">ここにデータが表示されます</div>
</div>

<div style="margin-top:10px; padding:10px; background:#f5f5f5; border:1px solid #ddd; border-radius:4px; font-size:12px; color:black; text-align:left;">
<b>【各種カウンター手動編集】</b><br>
ハードクリア駅: <input type="text" id="adm-hard-stations" style="width:200px; font-size:10px; background:#e0e0e0;" readonly title="ハードモードでクリアした駅一覧"><br>
連続ログイン: <input type="number" id="adm-cur-streak" style="width:50px;"> 日 / 最高: <input type="number" id="adm-max-streak" style="width:50px;"> 日 <button id="adm-save-streak">保存</button><br>
通算連勝: <input type="number" id="adm-total-streak" style="width:40px;"> 日 / 最高: <input type="number" id="adm-total-max" style="width:40px;"> 日 <button id="adm-save-total-streak">保存</button><br>
実績[ノーヒント]: <input type="number" id="adm-count-nohint" style="width:50px;"> 回 <button id="adm-save-achieve-1">保存</button><br>
実績[累計送信数]: <input type="number" id="adm-count-submit" style="width:50px;"> 回 <button id="adm-save-achieve-2">保存</button><br>
ユーザー設定(音声): <select id="adm-set-sound"><option value="true">ON</option><option value="false">OFF</option></select> <button id="adm-save-set">保存</button>
</div>

<div style="margin-top:10px; padding-top:10px; border-top:1px solid #ccc;">
<input type="number" id="admin-site-anni-year" value="1" style="width:40px; margin-right:5px;" title="サイト周年の数値(n)">
<select id="admin-event-select">
<option value="">通常（演出オフ）</option>
<option value="newyear">正月（🎍）</option>
<option value="valentine">バレンタイン（色）</option>
<option value="hinamatsuri">ひなまつり（🌸）</option>
<option value="aprilfool">エイプリルフール（反転）</option>
<option value="kodomo">こどもの日（🎏）</option>
<option value="site_anniversary">サイト周年（🎉とヘッドマーク）</option>
<option value="tanabata">七夕（🎋）</option>
<option value="railway">鉄道の日（色）</option>
<option value="halloween">ハロウィン（色）</option>
<option value="christmas">クリスマス（❄️＆色）</option>
<option value="nye">大晦日（🔔）</option>
</select>
<button id="admin-event-btn">演出テスト</button>
<button id="admin-user-anni-btn" style="background:#e8f5e9; border:1px solid #4caf50; margin-left:10px;">個人の周年をテスト(初回日を1年前の今日にする)</button>
<br>
<button id="admin-offline-banner-btn" style="background:#fff3e0; border:1px solid #ff9800; margin-top:10px; padding:4px 8px;">⚠️ オフライン警告バナーをテスト表示 (ON/OFF)</button>
</div>
`;
document.querySelector('header').insertAdjacentElement('afterend',adminPanel);
const getList=()=>window.stations||window.stationsList||window.allStations||(typeof stations!=='undefined'?stations:null);
let currentLength=4;
setInterval(()=>{
if(typeof todayStation!=='undefined'&&todayStation!==null){
currentLength=todayStation.yomi.length;
const savedAns=sessionStorage.getItem('admin_override_ans_'+currentLength);
if(savedAns&&todayStation.yomi!==savedAns){
const list=getList();
if(list){
const found=list.find(s=>(typeof s==='string'?s:(s.yomi||s.name))===savedAns);
if(found){
if(typeof found==='string'){todayStation.yomi=found;}else{Object.assign(todayStation,found);}
}
}
}
document.getElementById('debug-ans-text').textContent=todayStation.yomi+' ('+currentLength+'文字モード)';
}
},100);

const resetPlay=()=>{
  // 盤面とキーボードの進行状況（セーブデータ）だけを消去する
  localStorage.removeItem("ekiPuzzleStateV1");
  
  // ログの進行状況も今日の分だけ消去する
  if(typeof currentDayIndex !== "undefined"){
    let logData = JSON.parse(localStorage.getItem("ekiPuzzleStateV1_Log")||"{}");
    delete logData[currentDayIndex];
    localStorage.setItem("ekiPuzzleStateV1_Log", JSON.stringify(logData));
  }
  
  const keys=[];
  for(let i=0;i<sessionStorage.length;i++){
    const k=sessionStorage.key(i);
    if(k&&!k.startsWith('admin_override_ans_'))keys.push(k);
  }
  keys.forEach(k=>sessionStorage.removeItem(k));
};

// 基本ボタンの動作
document.getElementById('admin-set-btn').addEventListener('click',()=>{
const newAns=document.getElementById('admin-custom-ans').value.trim();
if(newAns!==''){
if(newAns.length!==currentLength){alert('エラー：現在のモードは '+currentLength+' 文字です。');return;}
sessionStorage.setItem('admin_override_ans_'+currentLength,newAns);
resetPlay(); alert('答えを変更し、盤面をリセットしました。'); location.reload();
}
});
document.getElementById('admin-rand-btn').addEventListener('click',()=>{
const list=getList();
if(list&&list.length>0&&currentLength){
const filteredList=list.filter(s=>{const name=typeof s==='string'?s:(s.yomi||s.name);return name&&name.length===currentLength;});
if(filteredList.length>0){
const randStation=filteredList[Math.floor(Math.random()*filteredList.length)];
const newAns=typeof randStation==='string'?randStation:(randStation.yomi||randStation.name);
sessionStorage.setItem('admin_override_ans_'+currentLength,newAns);
resetPlay(); alert('ランダムに変更し、盤面をリセットしました。'); location.reload();
}
}
});
document.getElementById('admin-reset-btn').addEventListener('click',()=>{resetPlay();location.reload();});
document.getElementById('admin-stats-wipe-btn').addEventListener('click',()=>{
if(confirm('戦績データ(勝率グラフ等)を初期化します。よろしいですか？')){localStorage.removeItem('ekiPuzzleStatsV2');location.reload();}
});

// 【新規追加】データ完全消去ボタンの動作
document.getElementById('admin-full-wipe-btn').addEventListener('click', () => {
  if (confirm('【警告】戦績、図鑑、履歴など、すべてのセーブデータを完全に消去して初期状態に戻します。本当によろしいですか？')) {
    localStorage.clear();
    sessionStorage.clear();
    alert('すべてのデータを完全に消去しました。');
    location.reload();
  }
});

// 行事日テスト
document.getElementById('admin-event-btn').addEventListener('click', () => {
  const ev = document.getElementById('admin-event-select').value;
  const nYear = document.getElementById('admin-site-anni-year').value;
  if (ev === "site_anniversary") {
    sessionStorage.setItem("debug_site_anni_year", nYear);
  }
  if (window.triggerEventEffect) window.triggerEventEffect(ev);
});

// 個人の周年テスト
document.getElementById('admin-user-anni-btn').addEventListener('click', () => {
  let meta = JSON.parse(localStorage.getItem("ekiZukanMeta") || '{}');
  const d = new Date();
  meta.firstPlayDate = (d.getFullYear() - 1) + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
  localStorage.setItem("ekiZukanMeta", JSON.stringify(meta));
  alert("初回プレイ日を「1年前の今日」に書き換えました。ページを再読み込みします。");
  location.reload();
});

// オフライン警告バナーのテスト（ON/OFFトグル）
document.getElementById('admin-offline-banner-btn').addEventListener('click', () => {
  // 画面内にすでに警告バナーが出ているか確認します
  const existingBanner = document.getElementById("offline-warning-banner");
  
  if (existingBanner) {
    // すでにある場合は、ボタン押下で消去（非表示）します
    existingBanner.remove();
  } else {
    // 【修正】特定のクラス名ではなく、headerタグそのものを直接探すように変更
    const header = document.querySelector("header");
    
    if (header) {
      // ヘッダーのすぐ後ろの位置にバナーを動的挿入します
      header.insertAdjacentHTML("afterend", `
        <div id="offline-warning-banner" style="background-color: #fff3e0; color: #e65100; font-size: 11px; font-weight: bold; text-align: center; padding: 6px; border-bottom: 1px solid #ffcc80; width: 100%; box-sizing: border-box;">
          ⚠️ バックアップデータで運行中。通常の出題と答えが異なる場合があります。
        </div>
      `);
    } else {
      // 万が一headerタグも見つからない場合の安全装置です
      alert("エラー：ヘッダー（headerタグ）が見つからないため表示できません。");
    }
  }
});

// 全データ一覧と直接編集
document.getElementById('adm-load-all-btn').addEventListener('click', () => {
  const container = document.getElementById('adm-all-data-container');
  container.innerHTML = '';
  let found = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('eki')) {
      found = true;
      let val = localStorage.getItem(key);
      let displayVal = val;
      try { displayVal = JSON.stringify(JSON.parse(val), null, 2); } catch(e) {}
      const block = document.createElement('div');
      block.style.marginBottom = '15px';
      block.style.borderBottom = '1px dashed #ccc';
      block.style.paddingBottom = '10px';
      block.innerHTML = `
        <div style="font-weight:bold; color:#d32f2f; margin-bottom:5px;">${key}</div>
        <textarea id="edit-${key}" style="width:100%; height:100px; font-family:monospace; font-size:12px; margin-bottom:5px;">${displayVal}</textarea>
        <div style="text-align:right;">
          <button id="save-${key}" style="background-color:#ffe6e6; color:#c62828; padding:4px 10px;">上書き保存</button>
        </div>
      `;
      container.appendChild(block);
      document.getElementById(`save-${key}`).addEventListener('click', () => {
        const newVal = document.getElementById(`edit-${key}`).value;
        try {
          if (newVal.trim().startsWith('{') || newVal.trim().startsWith('[')) JSON.parse(newVal);
          localStorage.setItem(key, newVal);
          alert(key + " を上書き保存しました。");
        } catch(e) {
          alert("エラー：正しいJSON形式ではありません。");
        }
      });
    }
  }
  if (!found) container.innerHTML = '駅ドルの保存データがありません。';
});

// 各種カウンター読み込みと保存
setTimeout(() => {
  let sData = JSON.parse(localStorage.getItem("ekiLoginStreak") || '{"currentStreak":0,"maxStreak":0}');
  let aData = JSON.parse(localStorage.getItem("ekiAchievements") || '{"counters":{"noHintClears":0,"totalSubmitCount":0},"winStreak":{"currentStreak":0,"maxStreak":0}}');
  let setData = JSON.parse(localStorage.getItem("ekiSettings") || '{"sound":true}');
  
  document.getElementById("adm-cur-streak").value = sData.currentStreak || 0;
  document.getElementById("adm-max-streak").value = sData.maxStreak || 0;
  document.getElementById("adm-total-streak").value = (aData.winStreak && aData.winStreak.currentStreak) ? aData.winStreak.currentStreak : 0;
  document.getElementById("adm-total-max").value = (aData.winStreak && aData.winStreak.maxStreak) ? aData.winStreak.maxStreak : 0;
  document.getElementById("adm-hard-stations").value = (aData.unlockedSets && aData.unlockedSets.hardClearedStationNames && aData.unlockedSets.hardClearedStationNames.length > 0) ? aData.unlockedSets.hardClearedStationNames.join(", ") : "なし";      // ハードモードでクリアした駅名をカンマ区切りで表示（データがなければ「なし」）
  document.getElementById("adm-count-nohint").value = (aData.counters && aData.counters.noHintClears) ? aData.counters.noHintClears : 0;
  document.getElementById("adm-count-submit").value = (aData.counters && aData.counters.totalSubmitCount) ? aData.counters.totalSubmitCount : 0;
  document.getElementById("adm-set-sound").value = String(setData.sound !== false);
  
  document.getElementById("adm-save-streak").addEventListener("click", () => {
    sData.currentStreak = parseInt(document.getElementById("adm-cur-streak").value, 10) || 0;
    sData.maxStreak = parseInt(document.getElementById("adm-max-streak").value, 10) || 0;
    localStorage.setItem("ekiLoginStreak", JSON.stringify(sData)); alert("保存しました。"); location.reload();
  });
  document.getElementById("adm-save-total-streak").addEventListener("click", () => {
    if (!aData.winStreak) aData.winStreak = { "currentStreak": 0, "maxStreak": 0, "lastClearedDate": "" };
    aData.winStreak.currentStreak = parseInt(document.getElementById("adm-total-streak").value, 10) || 0;
    aData.winStreak.maxStreak = parseInt(document.getElementById("adm-total-max").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData)); alert("保存しました。"); location.reload();
  });
  document.getElementById("adm-save-achieve-1").addEventListener("click", () => {
    if (!aData.counters) aData.counters = { "noHintClears": 0 };
    aData.counters.noHintClears = parseInt(document.getElementById("adm-count-nohint").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData)); alert("保存しました。"); location.reload();
  });
  document.getElementById("adm-save-achieve-2").addEventListener("click", () => {
    if (!aData.counters) aData.counters = { "totalSubmitCount": 0 };
    aData.counters.totalSubmitCount = parseInt(document.getElementById("adm-count-submit").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData)); alert("保存しました。"); location.reload();
  });
  document.getElementById("adm-save-set").addEventListener("click", () => {
    setData.sound = (document.getElementById("adm-set-sound").value === "true");
    localStorage.setItem("ekiSettings", JSON.stringify(setData)); alert("保存しました。"); location.reload();
  });
}, 500);
