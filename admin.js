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
<button id="admin-reset-btn" style="margin-right:5px;">入力値リセット</button>
<button id="admin-stats-wipe-btn" style="background-color:#ffe6e6; color:#c62828; border:1px solid #c62828;">戦績全消去</button>
<div style="margin-top:10px; padding:10px; background:#fff3e0; border:1px solid #ff9800; border-radius:4px;">
<b>【JSONデータ直接編集】</b><br>
<select id="adm-edit-key" style="padding:4px;">
<option value="ekiZukanData">図鑑 (ekiZukanData)</option>
<option value="ekiAllGuesses">入力履歴 (ekiAllGuesses)</option>
<option value="ekiAchievements">実績 (ekiAchievements)</option>
<option value="ekiPuzzleStatsV2">成績 (ekiPuzzleStatsV2)</option>
</select>
<button id="adm-load-key" style="margin-left:5px;">読込</button>
<button id="adm-save-key" style="background-color:#ffe6e6; color:#c62828; margin-left:5px;">上書き保存</button><br>
<textarea id="adm-edit-val" style="width:100%; height:100px; font-family:monospace; margin-top:5px; font-size:12px;"></textarea>
</div>
<div style="margin-top:10px; padding:10px; background:#f5f5f5; border:1px solid #ddd; border-radius:4px; font-size:12px; color:black; text-align:left;">
<b>【データ書き換えツール】</b><br>
連続ログイン: <input type="number" id="adm-cur-streak" style="width:50px;"> 日 / 最高: <input type="number" id="adm-max-streak" style="width:50px;"> 日 <button id="adm-save-streak">保存</button><br>
実績カウンター(深夜クリア回数): <input type="number" id="adm-count-midnight" style="width:50px;"> 回 <button id="adm-save-achieve">保存</button><br>
クリア済インデックス(日付インデックス追加): <input type="number" id="adm-clear-day" style="width:60px;"> <button id="adm-add-clear">追加</button><br>
通常連勝: <input type="number" id="adm-cur-streak" style="width:40px;"> 日 / 最高: <input type="number" id="adm-max-streak" style="width:40px;"> 日 <button id="adm-save-streak">保存</button><br>
通算連勝: <input type="number" id="adm-total-streak" style="width:40px;"> 日 / 最高: <input type="number" id="adm-total-max" style="width:40px;"> 日 <button id="adm-save-total-streak">保存</button><br>
実績[ノーヒント]: <input type="number" id="adm-count-nohint" style="width:50px;"> 回 <button id="adm-save-achieve-1">保存</button><br>
実績[累計送信数]: <input type="number" id="adm-count-submit" style="width:50px;"> 回 <button id="adm-save-achieve-2">保存</button><br>
ユーザー設定(音声): <select id="adm-set-sound"><option value="true">ON</option><option value="false">OFF</option></select> <button id="adm-save-set">保存</button>
</div>
<div style="margin-top:10px; padding-top:10px; border-top:1px solid #ccc;">
<select id="admin-event-select">
<option value="">通常（演出オフ）</option>
<option value="newyear">正月（🎍）</option>
<option value="valentine">バレンタイン（色）</option>
<option value="hinamatsuri">ひなまつり（🌸）</option>
<option value="aprilfool">エイプリルフール（反転）</option>
<option value="kodomo">こどもの日（🎏）</option>
<option value="anniversary">周年記念（🌸）</option>
<option value="tanabata">七夕（🎋）</option>
<option value="railway">鉄道の日（色）</option>
<option value="halloween">ハロウィン（色）</option>
<option value="christmas">クリスマス（❄️＆色）</option>
<option value="nye">大晦日（🔔）</option>
</select>
<button id="admin-event-btn">演出テスト</button>
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
if(typeof found==='string'){
todayStation.yomi=found;
}else{
Object.assign(todayStation,found);
}
}
}
}
document.getElementById('debug-ans-text').textContent=todayStation.yomi+' ('+currentLength+'文字モード)';
}
},100);
const resetPlay=()=>{
localStorage.clear();
const keys=[];
for(let i=0;i<sessionStorage.length;i++){
const k=sessionStorage.key(i);
if(k&&!k.startsWith('admin_override_ans_'))keys.push(k);
}
keys.forEach(k=>sessionStorage.removeItem(k));
};
document.getElementById('admin-set-btn').addEventListener('click',()=>{
const newAns=document.getElementById('admin-custom-ans').value.trim();
if(newAns!==''){
if(newAns.length!==currentLength){
alert('エラー：現在のモードは '+currentLength+' 文字です。'+currentLength+' 文字の駅名を入力してください。');
return;
}
sessionStorage.setItem('admin_override_ans_'+currentLength,newAns);
resetPlay();
alert('答えを「'+newAns+'」に設定し、すべての入力値をリセットします。');
location.reload();
}
});
document.getElementById('admin-rand-btn').addEventListener('click',()=>{
const list=getList();
if(list&&list.length>0&&currentLength){
const filteredList=list.filter(s=>{
const name=typeof s==='string'?s:(s.yomi||s.name);
return name&&name.length===currentLength;
});
if(filteredList.length>0){
const randStation=filteredList[Math.floor(Math.random()*filteredList.length)];
const newAns=typeof randStation==='string'?randStation:(randStation.yomi||randStation.name);
sessionStorage.setItem('admin_override_ans_'+currentLength,newAns);
resetPlay();
alert(currentLength+'文字の駅「'+newAns+'」をランダムに選びました。入力値をリセットします。');
location.reload();
}else{
alert('エラー：'+currentLength+'文字の駅データが見つかりません。');
}
}else{
alert('エラー：駅データが見つからないか、文字数モードが確定していません。');
}
});
document.getElementById('admin-reset-btn').addEventListener('click',()=>{
resetPlay();
alert('現在のプレイ状況（入力値）を完全にリセットしました。');
location.reload();
});
document.getElementById('admin-stats-wipe-btn').addEventListener('click',()=>{
if(confirm('【警告】4〜6文字すべての成績データ（勝率・分布など）を完全にリセットします。よろしいですか？')){
localStorage.removeItem('ekiPuzzleStatsV2');
alert('全成績データを初期化しました。');
location.reload();
}
});

//行事日エフェクト
document.getElementById('admin-event-btn').addEventListener('click',()=>{
const ev=document.getElementById('admin-event-select').value;
if(window.triggerEventEffect) window.triggerEventEffect(ev);
});

//保存データ閲覧用
document.getElementById('admin-view-storage-btn').addEventListener('click',()=>{
const viewArea=document.getElementById('admin-storage-view');
if(viewArea.style.display==='block'){
viewArea.style.display='none';
return;
}
let output='=== LocalStorage 保存データ ===\n\n';
let found=false;
for(let i=0;i<localStorage.length;i++){
const key=localStorage.key(i);
// 「eki」から始まる駅ドル関連のデータだけを抽出します
if(key.startsWith('eki')){
found=true;
let val=localStorage.getItem(key);
try{
// JSONデータであれば、見やすく改行・インデントして整形します
val=JSON.stringify(JSON.parse(val),null,2);
}catch(e){}
output+='【 '+key+' 】\n'+val+'\n\n';
}
}
if(!found) output+='駅ドルの保存データがありません。';
viewArea.textContent=output;
viewArea.style.display='block';
});

// 管理者パネルが画面に描画された後に、入力欄に現在の数値を入れ、ボタンの動作を登録する
setTimeout(() => {
  // 保存されているデータを読み込む（実績データは最新の構造で読み込む）
  let sData = JSON.parse(localStorage.getItem("ekiLoginStreak") || '{"currentStreak":0,"maxStreak":0}');
  let aData = JSON.parse(localStorage.getItem("ekiAchievements") || '{"counters":{"noHintClears":0,"totalSubmitCount":0},"winStreak":{"currentStreak":0,"maxStreak":0}}');
  let setData = JSON.parse(localStorage.getItem("ekiSettings") || '{"sound":true}');
  
  // 画面の入力欄に現在のデータを入れておく
  document.getElementById("adm-cur-streak").value = sData.currentStreak || 0;
  document.getElementById("adm-max-streak").value = sData.maxStreak || 0;
  
  // 新しく追加した通算連勝、ノーヒント回数、累計送信数のデータを入力欄に入れる
  document.getElementById("adm-total-streak").value = (aData.winStreak && aData.winStreak.currentStreak) ? aData.winStreak.currentStreak : 0;
  document.getElementById("adm-total-max").value = (aData.winStreak && aData.winStreak.maxStreak) ? aData.winStreak.maxStreak : 0;
  document.getElementById("adm-count-nohint").value = (aData.counters && aData.counters.noHintClears) ? aData.counters.noHintClears : 0;
  document.getElementById("adm-count-submit").value = (aData.counters && aData.counters.totalSubmitCount) ? aData.counters.totalSubmitCount : 0;
  
  document.getElementById("adm-set-sound").value = String(setData.sound !== false);
  
  // 通常の連続ログイン日数を保存する処理
  document.getElementById("adm-save-streak").addEventListener("click", () => {
    sData.currentStreak = parseInt(document.getElementById("adm-cur-streak").value, 10) || 0;
    sData.maxStreak = parseInt(document.getElementById("adm-max-streak").value, 10) || 0;
    localStorage.setItem("ekiLoginStreak", JSON.stringify(sData));
    alert("通常連続ログイン日数を変更しました。");
    location.reload();
  });
  
  // 【新規追加】通算連勝データを保存する処理
  document.getElementById("adm-save-total-streak").addEventListener("click", () => {
    if (!aData.winStreak) aData.winStreak = { "currentStreak": 0, "maxStreak": 0, "lastClearedDate": "" };
    aData.winStreak.currentStreak = parseInt(document.getElementById("adm-total-streak").value, 10) || 0;
    aData.winStreak.maxStreak = parseInt(document.getElementById("adm-total-max").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData));
    alert("通算連勝データを変更しました。");
    location.reload();
  });
  
  // 【新規追加】ノーヒントクリア回数を保存する処理
  document.getElementById("adm-save-achieve-1").addEventListener("click", () => {
    if (!aData.counters) aData.counters = { "noHintClears": 0 };
    aData.counters.noHintClears = parseInt(document.getElementById("adm-count-nohint").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData));
    alert("ノーヒントクリア回数を変更しました。");
    location.reload();
  });
  
  // 【新規累計回答送信数を保存する処理
  document.getElementById("adm-save-achieve-2").addEventListener("click", () => {
    if (!aData.counters) aData.counters = { "totalSubmitCount": 0 };
    aData.counters.totalSubmitCount = parseInt(document.getElementById("adm-count-submit").value, 10) || 0;
    localStorage.setItem("ekiAchievements", JSON.stringify(aData));
    alert("累計回答送信数を変更しました。");
    location.reload();
  });
  
  // ユーザー設定（音声）を保存する処理
  document.getElementById("adm-save-set").addEventListener("click", () => {
    setData.sound = (document.getElementById("adm-set-sound").value === "true");
    localStorage.setItem("ekiSettings", JSON.stringify(setData));
    alert("ユーザー設定を更新しました。");
    location.reload();
  });
}, 500);


// エディタの「読込」ボタンを押したときの処理
document.getElementById('adm-load-key').addEventListener('click', () => {
  // 選択されたデータの名前（キー）を取得する
  const key = document.getElementById('adm-edit-key').value;
  // パソコン内からデータを取得する
  const val = localStorage.getItem(key);
  try {
    // 取得したデータが存在すれば、改行して綺麗に整え、テキストエリアに表示する
    document.getElementById('adm-edit-val').value = val ? JSON.stringify(JSON.parse(val), null, 2) : "{}";
  } catch(e) {
    // データが壊れている場合はそのまま表示する
    document.getElementById('adm-edit-val').value = val || "";
  }
});

// エディタの「上書き保存」ボタンを押したときの処理
document.getElementById('adm-save-key').addEventListener('click', () => {
  const key = document.getElementById('adm-edit-key').value;
  const val = document.getElementById('adm-edit-val').value;
  try {
    // ユーザーが書き換えた文字が、正しいJSONデータか確認する（エラーチェック）
    JSON.parse(val);
    // 問題なければパソコン内に上書き保存する
    localStorage.setItem(key, val);
    alert(key + " を上書き保存しました。");
  } catch(e) {
    alert("エラー：入力されたテキストは正しいJSON形式ではありません。（括弧やカンマの閉じ忘れなど）");
  }
});

// 「個人の周年をテスト」ボタンを押したときの処理
document.getElementById('admin-user-anni-btn').addEventListener('click', () => {
  // メタデータ（初回プレイ日など）を読み込む
  let meta = JSON.parse(localStorage.getItem("ekiZukanMeta") || '{}');
  const d = new Date();
  // 強制的に、初回プレイ日を「今日のちょうど1年前」に書き換える
  meta.firstPlayDate = (d.getFullYear() - 1) + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
  localStorage.setItem("ekiZukanMeta", JSON.stringify(meta));
  alert("初回プレイ日を「1年前の今日」に書き換えました。ページを再読み込みします。");
  location.reload();
});
