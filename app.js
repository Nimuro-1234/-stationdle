//1.共通変数の定義
let stations=[];　　　　　　　//すべての駅データの入れる箱
let availableStations=[];　　//選択文字数に一致する駅を入れる箱
let todayStation=null;　　　 //今日の正解駅
let currentGuess="";　　　　 //プレイヤーが入力している途中の文字を記憶する箱
let guessesSubmitted=0;　　　//プレイヤーの回答送信回数カウンター
let maxGuesses=8;　　　　　　//上限回答数(文字数により変動)
let rowLength=4;　　　　　　 //入力パネルの文字数
let currentMode=4;　　　　　 //現在遊んでいるモードの文字数
let keyColors={};　　　　　　//キーボードの各ボタンについている色を記憶する箱
let gridHistory=[];         //プレイヤーが送信した過去の回答の色の結果を履歴として残す箱
let debugOffset=0;　　　　　 //デバッグ時に日付を強制的にずらすための数値
let msgTimeout=null;　　　　 //画面にポップアップを出した後、自動で消すためのタイマー
let currentDayIndex=0;　　　 //基準日から数えて今日が何日目かを表す数字
let isAprilFoolMode=false;　 //今がエイプリルフール限定モードを判定するためのフラグ
let savedState={};　　　　　　//各文字のモードで今日のゲームの途中経過を保存する箱
let ekiSettings=JSON.parse(localStorage.getItem("ekiSettings")||'{"theme":"","sound":true,"fontSize":"normal"}');　　　//ユーザー設定を保存する箱
let ekiLoginStreak=JSON.parse(localStorage.getItem("ekiLoginStreak")||'{"currentStreak":0,"maxStreak":0,"lastLoginDate":""}');　　//連続ログイン日数を保存する箱
let ekiClearedDays=JSON.parse(localStorage.getItem("ekiClearedDays")||'{"4":[],"5":[],"6":[]}');　　　//クリアした日を保存する箱　
let ekiAchievements=JSON.parse(localStorage.getItem("ekiAchievements")||'{"bestScores":{},"counters":{"legendStationClears":0,"noAbsentClears":0,"totalYomiLength":0,"noHintClears":0,"hintUsedClears":0,"totalSubmitCount":0},"winStreak":{"currentStreak":0,"maxStreak":0,"lastClearedDate":""},"hourlyClears":{},"unlockedSets":{"prefs":[],"companies":[],"lines":[],"colorCounts":{"4":{"correct":0,"present":0,"diacritic":0,"absent":0}},"clearedEvents":[],"clearedMonthDays":[],"clearedStationNames":[]}}');　　// 実績データの全体構造を定義
//各文字数モード毎の累計プレイ回数、勝率、連勝記録、最大連勝、何回目で当たったかを記録する箱
let userStats={　　　　　　　
4:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]},
5:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]},
6:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]}
};
//過去に解いた問題を記録しておく箱
let dailyArchive={};

// ==========================================
//連続ログイン日数処理
// ==========================================

// 連続ログイン日数をチェックし、データを更新する関数
function updateLoginStreak() {
  let streakData = JSON.parse(localStorage.getItem("ekiLoginStreak") || '{"currentStreak":0,"maxStreak":0,"lastLoginDate":""}');
  
  // 今日の日付を「YYYY-MM-DD」の形式で取得します
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
  
  // 今日すでにログインして処理が終わっていれば、何もせずに終了します
  if (streakData.lastLoginDate === todayStr) {
    return;
  }
  
  // 比較のために「昨日」の日付を計算します
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, '0') + "-" + String(yesterday.getDate()).padStart(2, '0');
  
  // 最後にログインした日が「昨日」であれば、連続ログイン日数を1日増やします
  if (streakData.lastLoginDate === yesterdayStr) {
    streakData.currentStreak++;
  } else {
    // 最後にログインした日が「一昨日以前」、または「初めてのプレイ」の場合は1日にリセットします
    streakData.currentStreak = 1;
  }
  
  // 現在の連続日数が過去の最高記録（最大連勝）を上回った場合、最高記録を塗り替えます
  if (streakData.currentStreak > streakData.maxStreak) {
    streakData.maxStreak = streakData.currentStreak;
  }
  
  // 最終ログイン日を「今日」に書き換えて、ローカルファイルに保存します
  streakData.lastLoginDate = todayStr;
  localStorage.setItem("ekiLoginStreak", JSON.stringify(streakData));
}


// ==========================================
// 文字数判定
// ==========================================

//キーボード表示色優先順位（緑＞黄＞紫＞灰）
const colorPriority={"correct":4,"present":3,"diacritic":2,"absent":1};
const colorToEmoji={"correct":"🟩","present":"🟨","diacritic":"🟪","absent":"⬛"};
//濁点（が）・半濁点（ぱ）・小文字（ゃ）を元の文字（か、は、やなど）に変換するための対応表
const baseMap={
"が":"か","ぎ":"き","ぐ":"く","げ":"け","ご":"こ",
"ざ":"さ","じ":"し","ず":"す","ぜ":"せ","ぞ":"そ",
"だ":"た","ぢ":"ち","づ":"つ","で":"て","ど":"と",
"ば":"は","び":"ひ","ぶ":"ふ","べ":"へ","ぼ":"ほ",
"ぱ":"は","ぴ":"ひ","ぷ":"ふ","ぺ":"へ","ぽ":"ほ",
"ぁ":"あ","ぃ":"い","ぅ":"う","ぇ":"え","ぉ":"お",
"っ":"つ","ゃ":"や","ゅ":"ゆ","ょ":"よ","ゎ":"わ"
};
//キーボード（清音）グループ
const seionGroups=[
["あ","い","う","え","お"],["か","き","く","け","こ"],["さ","し","す","せ","そ"],
["た","ち","つ","て","と"],["な","に","ぬ","ね","の"],["は","ひ","ふ","へ","ほ"],
["ま","み","む","め","も"],["や","","ゆ","","よ"],["ら","り","る","れ","ろ"],["わ","ー","を","","ん"]
];
//キーボード（濁音・半濁点・小文字）グループ
const dakuonGroups=[
["が","ぎ","ぐ","げ","ご"],["ざ","じ","ず","ぜ","ぞ"],["だ","ぢ","づ","で","ど"],
["ば","び","ぶ","べ","ぼ"],["ぱ","ぴ","ぷ","ぺ","ぽ"],["ぁ","ぃ","ぅ","ぇ","ぉ"],
["ゃ","","ゅ","","ょ"],["っ","","ゎ","",""]
];
//引数でもらった文字に濁点・半濁点・小文字がある場合、清音に戻して返す
function getBaseChar(c){return baseMap[c]||c;}
//カタカナのフリガナをすべてひらがなに変換する
function toHiragana(str){ return str.replace(/[ァ-ン]/g,m=>String.fromCharCode(m.charCodeAt(0)-0x60)); }


// ==========================================
// ゲーム初期化処理
// ==========================================

//画面読み込み時に最初に実行され、データ準備やボタン登録などを行う
async function initGame(){
try{
loadStats();　　　　　　　//全プレイヤーの戦績データをパソコンから読み込む
updateLoginStreak(); 　　//連続ログイン日数をカウント
//すべての駅データが書かれた「station.json」ファイルをインターネット経由で読み込む
const res=await fetch('stations.json');
const raw=await res.json();
//貨物専用駅を除外し、駅名の読みを全てひらがなに整えて保存
stations=raw.filter(s=>!(s.companies&&s.companies.length===1&&s.companies[0]==="日本貨物鉄道")).map(s=>({...s,yomi:toHiragana(s.yomi)}));
if(stations.length===0)return;
//画面下部の「回答」「1字消す」「全削除」ボタンの動作
document.getElementById("enter-btn").addEventListener("click",()=>handleKeyPress("ENTER"));
document.getElementById("back-btn").addEventListener("click",()=>handleKeyPress("BACK"));
document.getElementById("clear-btn").addEventListener("click",()=>handleKeyPress("CLEAR"));
//メニューの三本線が押されたときにサイドメニューを出す
document.getElementById("menu-btn").addEventListener("click",()=>{
document.getElementById("side-menu-overlay").style.display="block";
setTimeout(()=>document.getElementById("side-menu").style.right="0",10);
});
//メニューの外側や閉じるボタンが押されたらメニューを右側に隠す
const closeSideMenu=()=>{
document.getElementById("side-menu").style.right="-250px";
setTimeout(()=>document.getElementById("side-menu-overlay").style.display="none",300);
};
document.getElementById("close-menu-btn").addEventListener("click",closeSideMenu);
document.getElementById("side-menu-overlay").addEventListener("click",closeSideMenu);
//「？」ボタンが押されたら遊び方の説明画面を開き、×ボタンで閉じる
document.getElementById("help-btn").addEventListener("click",()=>{
document.getElementById("help-modal").style.display="flex";
});
document.getElementById("close-help-btn").addEventListener("click",()=>{
document.getElementById("help-modal").style.display="none";
});
//「グラフ」ボタンが押されたとき、ゲームが終わっていれば結果ウィンドウを表示
document.getElementById("stats-btn").addEventListener("click",()=>{
if(savedState[currentMode].isOver) showResultModal(savedState[currentMode].isWin, true);
else showMessage("ゲームクリア後に見ることができます");
});
//「4文字」「5文字」「6文字」の切り替えボタンが押されたときの処理
[4,5,6].forEach(num=>{
document.getElementById(`mode-${num}`).addEventListener("click",()=>{
document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
document.getElementById(`mode-${num}`).classList.add("active");
currentMode=num; rowLength=num; maxGuesses=(num===4)?8:6;
document.getElementById("game-board").style.setProperty("--row-length",num);
selectTodayStation(); restoreBoard();
});
});
//結果ウィンドウにある各種SNSへのシェアボタンやコピーボタンの動作
document.getElementById("share-btn").addEventListener("click",()=>shareResult("twitter"));
document.getElementById("line-btn").addEventListener("click",()=>shareResult("line"));
document.getElementById("fb-btn").addEventListener("click",()=>shareResult("facebook"));
document.getElementById("copy-btn").addEventListener("click",()=>shareResult("copy"));
document.getElementById("close-modal-btn").addEventListener("click",()=>{
document.getElementById("result-modal").style.display="none";
});
//「パレット」ボタンが押されたときに画面全体のテーマカラーを順番に変更する
const themes=["","theme-dark","theme-sakura","theme-ocean","theme-green","theme-orange","theme-red","theme-blue","theme-purple"];
let themeIdx=0;
if(ekiSettings.theme){
themeIdx=themes.indexOf(ekiSettings.theme);
if(themeIdx>-1&&ekiSettings.theme!=="")document.body.classList.add(ekiSettings.theme);
}
document.getElementById("theme-btn").addEventListener("click",()=>{
document.body.className=document.body.className.replace(/event-\w+/g,"");
if(themes[themeIdx]!=="")document.body.classList.remove(themes[themeIdx]);
themeIdx=(themeIdx+1)%themes.length;
if(themes[themeIdx]!=="")document.body.classList.add(themes[themeIdx]);
ekiSettings.theme=themes[themeIdx];
localStorage.setItem("ekiSettings",JSON.stringify(ekiSettings));
});
//最後に、今日の正解駅を選び、ゲーム盤を作り、行事日かどうかを調べる
selectTodayStation(); restoreBoard(); checkSpecialEvent();
}catch(e){ console.error("データエラー:",e); }
}


// ==========================================
// パソコン（ブラウザ）へデータを保存・読み込み
// ==========================================

//保存されている過去の戦績データを読み込む
function loadStats(){
const saved=localStorage.getItem("ekiPuzzleStatsV2");
if(saved) userStats=JSON.parse(saved);
}
//今回のゲーム結果をこれまでのデータに加算して新しく保存する
function saveStats(isWin,actualGuesses){
let st=userStats[currentMode];
if(!st.dist) st.dist=[0,0,0,0,0,0,0,0,0,0];
st.played++;
if(isWin){
st.won++; st.currentStreak++;
if(st.currentStreak>st.maxStreak)st.maxStreak=st.currentStreak;
st.dist[actualGuesses]=(st.dist[actualGuesses]||0)+1;
}else{ st.currentStreak=0; }
localStorage.setItem("ekiPuzzleStatsV2",JSON.stringify(userStats));
}
//過去に遊んだアーカイブ情報を読み込む
function loadArchive(){
const saved=localStorage.getItem("ekiPuzzleArchiveV1");
if(saved) dailyArchive=JSON.parse(saved);
}
//今日の問題をアーカイブへ保存する
function saveToArchive(){
if(!dailyArchive[currentDayIndex]) dailyArchive[currentDayIndex]={};
dailyArchive[currentDayIndex][currentMode]={kanji:todayStation.kanji, yomi:todayStation.yomi};
localStorage.setItem("ekiPuzzleArchiveV1",JSON.stringify(dailyArchive));
}
// ゲームの進行状況を日付ごとに保存・読み込みする処理です
function loadGameState(dayIdx){
  const savedLog=localStorage.getItem("ekiPuzzleStateV1_Log");
  let logData=savedLog?JSON.parse(savedLog):{};
  let todayStr=new Date().toISOString().split('T')[0];
  let meta=JSON.parse(localStorage.getItem("ekiZukanMeta")||'{"totalLogins":0,"lastLoginDate":"","firstPlayDate":""}');
  
  // 初回プレイ日の記録がない場合は、今日をプレイ開始日として記録します
  if(!meta.firstPlayDate) meta.firstPlayDate=todayStr;
  
  if(meta.lastLoginDate!==todayStr){
    meta.totalLogins++;
    meta.lastLoginDate=todayStr;
    localStorage.setItem("ekiZukanMeta",JSON.stringify(meta));
  }
  if(logData[dayIdx]){
    savedState=logData[dayIdx];
    return;
  }
  // モードごとに独立したタイマー（startTime/endTime）と、ヒント使用履歴（usedHint）を仕込みます
  savedState={ 
    date:String(dayIdx), 
    isDaily:true,
    4:{guesses:[],guessTimes:[],startTime:null,endTime:null,usedHint:false,isWin:false,isOver:false}, 
    5:{guesses:[],guessTimes:[],startTime:null,endTime:null,usedHint:false,isWin:false,isOver:false}, 
    6:{guesses:[],guessTimes:[],startTime:null,endTime:null,usedHint:false,isWin:false,isOver:false} 
  };
  logData[dayIdx]=savedState;
  localStorage.setItem("ekiPuzzleStateV1_Log",JSON.stringify(logData));
}


// ==========================================
// 今日の正解駅を決定する処理
// ==========================================

//今日出題する駅を、日付をもとにした乱数シードにより1つ決定
function selectTodayStation(){
const modeStations=stations.filter(s=>s.yomi.length===currentMode);
if(modeStations.length===0){
alert(`エラー: ${currentMode}文字の駅データが見つかりません。`);
todayStation={kanji:"えらー",yomi:"えらー"}; return;
}
//2024年1月1日を基準に、今日が何日目かを決定する
const t=new Date();
const tDate=new Date(t.getFullYear(),t.getMonth(),t.getDate());
const baseDate=new Date(2024,0,1);
currentDayIndex=Math.round((tDate-baseDate)/86400000)+debugOffset;
loadGameState(currentDayIndex);
//直近で出題された駅とできるだけ被らないようにしながら今日の正解駅を1つ決定
let uniqueYomiCount=new Set(modeStations.map(s=>s.yomi)).size;
let lookback=Math.min(1000,Math.floor(uniqueYomiCount*0.7));
let history=[];
for(let d=0;d<=currentDayIndex;d++){
let recentSet=new Set(history.slice(-lookback));
let pool=modeStations.filter(s=>!recentSet.has(s.yomi));
let seed=d*12345+currentMode*6789;
let hash=Math.imul(seed^(seed>>>15),2246822507);
hash=Math.imul(hash^(hash>>>13),3266489909);
hash=(hash^(hash>>>16))>>>0;
let candidate=pool[hash%pool.length];
history.push(candidate.yomi);
if(d===currentDayIndex)todayStation=candidate;
}
//デバッグ時、ブラウザのコンソールに答えを出力
console.log(`※${currentMode}文字の答え:`,todayStation.kanji,todayStation.yomi);
}


// ==========================================
// 入力タイルとキーボード組み立て処理
// ==========================================

//入力タイル（四角いマス目）を画面に並べる処理
function drawBoard(){
const board=document.getElementById("game-board");
document.querySelectorAll(".board-row").forEach(e=>e.remove());
for(let i=0;i<maxGuesses;i++){
const row=document.createElement("div");
row.className="board-row";
row.id=`row-${i}`;
for(let j=0;j<rowLength;j++){
const tile=document.createElement("div");
tile.className="tile";
tile.id=`row-${i}-tile-${j}`;
row.appendChild(tile);
}
board.appendChild(row);
}
}
//全国すべての駅名で実際に使われている文字だけを取り出し、キーボードを作成
function buildKeyboard(){
let allChars=new Set();
stations.forEach(s=>{ for(let c of s.yomi)allChars.add(c); });
const kb=document.getElementById("keyboard");
kb.innerHTML="";
const sTitle=document.createElement("div"); sTitle.className="keyboard-title"; sTitle.textContent="【清音】"; kb.appendChild(sTitle);
const sDiv=document.createElement("div"); sDiv.className="keyboard-section";
seionGroups.slice().reverse().forEach(group=>{
let col=document.createElement("div"); col.className="key-col"; let hasKey=false;
group.forEach(c=>{if(c!==""&&allChars.has(c))hasKey=true;});
if(hasKey){
group.forEach(c=>{
if(c!==""&&allChars.has(c)) col.appendChild(createKey(c));
else { let d=document.createElement("div"); d.className="key dummy"; col.appendChild(d); }
});
sDiv.appendChild(col);
}
});
kb.appendChild(sDiv);
const dTitle=document.createElement("div"); dTitle.className="keyboard-title"; dTitle.textContent="【濁音・半濁音・小文字】"; kb.appendChild(dTitle);
const dDiv=document.createElement("div"); dDiv.className="keyboard-section";
dakuonGroups.slice().reverse().forEach(group=>{
let col=document.createElement("div"); col.className="key-col"; let hasKey=false;
group.forEach(c=>{if(c!==""&&allChars.has(c))hasKey=true;});
if(hasKey){
group.forEach(c=>{
if(c!==""&&allChars.has(c)) col.appendChild(createKey(c));
else { let d=document.createElement("div"); d.className="key dummy"; col.appendChild(d); }
});
dDiv.appendChild(col);
}
});
kb.appendChild(dDiv);
}
//キーボードのボタンを1個作成し、クリックされたらその文字が入力されるようにする
function createKey(char){
let btn=document.createElement("button");
btn.textContent=char;
btn.className="key";
btn.id="key-"+char;
btn.addEventListener("click",()=>handleKeyPress(char));
return btn;
}

//モード変更時、パネルをまっさらにして前回の状態を綺麗に復元する
function restoreBoard(){
currentGuess=""; guessesSubmitted=0; gridHistory=[]; keyColors={};
availableStations=stations.filter(s=>s.yomi.length===currentMode);
drawBoard(); buildKeyboard();
const box=document.getElementById("message-box");
if(box) box.classList.add("hidden");
const modal=document.getElementById("result-modal");
if(modal) modal.style.display="none";
let st=savedState[currentMode];
st.guesses.forEach(g=>{ currentGuess=g; submitGuess(true); });
currentGuess="";
}


// ==========================================
// プレイヤーの入力を処理する
// ==========================================
// キーボードの文字や、特殊ボタン（回答・消去）が押されたときの振り分けを行います
function handleKeyPress(char){
  let st=savedState[currentMode];
  if(st.isOver||guessesSubmitted>=maxGuesses)return;
  
  // そのモードで「最初の1文字目」が入力された瞬間に、専用のタイマーをスタートします
  if(!st.startTime && char!=="BACK" && char!=="CLEAR" && char!=="ENTER"){
    st.startTime=Date.now();
    const savedLog=localStorage.getItem("ekiPuzzleStateV1_Log");
    let logData=savedLog?JSON.parse(savedLog):{};
    logData[currentDayIndex]=savedState;
    localStorage.setItem("ekiPuzzleStateV1_Log",JSON.stringify(logData));
  }
　//「1文字削除」「全削除」「回答」ボタンが押されたときの処理
  if(char==="BACK"){
    if(currentGuess.length>0){ currentGuess=currentGuess.slice(0,-1); updateTiles(); }
  }else if(char==="CLEAR"){
    currentGuess=""; updateTiles();
  }else if(char==="ENTER"){
    if(currentGuess.length===rowLength) submitGuess(false);
    else showMessage(`${rowLength}文字入力してください`);
  }else{
    if(currentGuess.length<rowLength){ currentGuess+=char; updateTiles(); }
  }
}
//タイルに入力中文字を表示する
function updateTiles(){
  for(let j=0;j<rowLength;j++){
    const tile=document.getElementById(`row-${guessesSubmitted}-tile-${j}`);
    tile.textContent=currentGuess[j]||"";
  }
}


// ==========================================
// 文字の色判定処理
// ==========================================
//入力された駅名と正解の駅名を比較し、どのマスが「緑・黄・紫・黒」になるかを詳しく計算する
function evaluateGuess(guess,target){
let results=new Array(rowLength).fill("absent");
let targetArr=target.split(""); let guessArr=guess.split(""); let targetCounts={};
for(let c of targetArr)targetCounts[c]=(targetCounts[c]||0)+1;
//【ステップ1】場所も文字もぴったり合っているマスを「correct（緑）」にする
for(let i=0;i<rowLength;i++){
if(guessArr[i]===targetArr[i]){ results[i]="correct"; targetCounts[guessArr[i]]--; }
}
//【ステップ2】場所は違うけれど、その文字が駅名の別の場所に含まれていれば「present（黄）」にする
for(let i=0;i<rowLength;i++){
if(results[i]==="correct")continue;
let c=guessArr[i];
if(targetCounts[c]>0){ results[i]="present"; targetCounts[c]--; }
}
// 【ステップ3】文字自体は違うが、濁点違い・小文字違い（例：「か」に対して「が」など）があれば「diacritic（紫）」にする
let baseTargetCounts={};
for(let char in targetCounts){
if(targetCounts[char]>0){ let bc=getBaseChar(char); baseTargetCounts[bc]=(baseTargetCounts[bc]||0)+targetCounts[char]; }
}
for(let i=0;i<rowLength;i++){
if(results[i]!=="absent")continue;
let bg=getBaseChar(guessArr[i]);
if(baseTargetCounts[bg]>0){ results[i]="diacritic"; baseTargetCounts[bg]--; }
}
//すべての判定が終わったら、各マスの色のリストを返す
return results;
}


//==========================================
//図鑑データを更新・保存するための専用の処理
//==========================================
//駅の読みがなと状態（1=遭遇、2=的中）を受け取ってパソコンに記録する
function updateZukan(yomi, status){
const savedZukan=localStorage.getItem("ekiZukanData");
let zukan=savedZukan?JSON.parse(savedZukan):{};
let todayStr=new Date().toISOString().split('T')[0];
let currentStatus=zukan[yomi]?zukan[yomi].status:0;
//以前より良い状態（未発見→遭遇、遭遇→的中）になった場合のみ上書き保存する
if(status>currentStatus){
zukan[yomi]={status:status, date:todayStr};
localStorage.setItem("ekiZukanData",JSON.stringify(zukan));
}
}


// ==========================================
// 9. 回答を送信したときの処理とゲームの勝敗判定
// ==========================================
// プレイヤーが「回答」ボタンを押したときに、実際の答え合わせと画面への色付けを行う
function submitGuess(isRestore=false){
// 入力された駅名が、その文字数の実在する駅名リストにあるかチェック
const isValid=stations.filter(s=>s.yomi.length===currentMode).some(s=>s.yomi===currentGuess);
if(!isValid){ if(!isRestore)showMessage("実在しない駅名です"); return; }
let st=savedState[currentMode];
if(!isRestore){ 
st.guesses.push(currentGuess); 
st.guessTimes.push(Date.now());
localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState)); 
// 【実績用】これまでに入力したすべての実在駅名を重複しないようにリストへ保存
let allGuessed=JSON.parse(localStorage.getItem("ekiAllGuesses")||"[]");
if(!allGuessed.includes(currentGuess)){
allGuessed.push(currentGuess);
localStorage.setItem("ekiAllGuesses",JSON.stringify(allGuessed));
}
// 【図鑑用】実在する駅を入力したので、図鑑に「入力（ステータス2）」として記録
updateZukan(currentGuess, 2);
}
// 文字判定ロジックを使って、各マスの色を取得
const resultColors=evaluateGuess(currentGuess,todayStation.yomi);
gridHistory.push(resultColors);
// ゲーム盤のマス目に色のアニメーションクラスをつけ、キーボードのボタンの色も連動して更新
for(let j=0;j<rowLength;j++){
const tile=document.getElementById(`row-${guessesSubmitted}-tile-${j}`);
tile.textContent=currentGuess[j];
tile.classList.add(resultColors[j]);
const char=currentGuess[j]; const color=resultColors[j];
updateKeyColor(char,color);
// もしその文字が全く含まれていなければ、その文字の濁点版なども一括でキーボード上で黒にする
if(color==="absent"){
let base=getBaseChar(char);
let targetBaseChars=todayStation.yomi.split("").map(getBaseChar);
if(!targetBaseChars.includes(base)){
let variants=Object.keys(baseMap).filter(k=>baseMap[k]===base);
variants.push(base); variants.forEach(v=>updateKeyColor(v,"absent"));
}
}
}
// この入力によって、正解の可能性がある残りの駅が全国にいくつあるかを絞り込む
filterAvailableStations(currentGuess,resultColors,isRestore);
// ここからパネルの色カウント処理
//※最後の行のパネル色しか読み込まれないバグがあるため、実装時に修正が必要
//let achColor = JSON.parse(localStorage.getItem("ekiAchievements"));
//if(!achColor.colorCounts) achColor.colorCounts = {"4":{"correct":0,"present":0,"diacritic":0,"absent":0},"5":{"correct":0,"present":0,"diacritic":0,"absent":0},"6":{"correct":0,"present":0,"diacritic":0,"absent":0}};
//if(!achColor.colorCounts[currentMode]) achColor.colorCounts[currentMode] = {"correct":0,"present":0,"diacritic":0,"absent":0};
//let lastColors = gridHistory[gridHistory.length - 1];
//if(lastColors){
//  lastColors.forEach(color => {
//    if(achColor.colorCounts[currentMode][color] !== undefined) {
//      achColor.colorCounts[currentMode][color]++;
//    }
//  });
//  localStorage.setItem("ekiAchievements", JSON.stringify(achColor));
//}
// すべての文字が一致した場合の処理
if(currentGuess===todayStation.yomi){
  let actualGuesses=guessesSubmitted+1;
  guessesSubmitted=maxGuesses;
  if(!isRestore){ 
    st.endTime=Date.now();
    // 【図鑑用】見事正解したので、図鑑に「的中（ステータス3）」として上書き記録
    updateZukan(todayStation.yomi, 3);
    st.isOver=true; st.isWin=true; saveStats(true,actualGuesses); localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState));
    //【実績用】実績を追加する
    incrementClearAchievements(actualGuesses, (st.endTime - st.startTime));
    //正解時メッセージの処理
    let winHtml=`<div style="font-size:24px; font-weight:bold; color:#fff; letter-spacing:2px;">正解！🎉</div>`;
    showMessage(winHtml,"#ff9800","none","0 4px 10px rgba(0,0,0,0.3)");
    setTimeout(()=>{ showResultModal(true,false); },2000);
    }
  return;
}
guessesSubmitted++;
if(!isRestore) currentGuess="";
// 回答回数が上限に達してしまい、ゲームオーバーになった場合の処理
if(guessesSubmitted===maxGuesses){
if(!isRestore){
// 【図鑑用】ゲームオーバーで答えを見たので、正解の駅を図鑑に「目撃（ステータス1）」として記録
updateZukan(todayStation.yomi, 1);
st.isOver=true; st.isWin=false; saveStats(false,0); savedState.endTime=Date.now(); localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState));
setTimeout(()=>showResultModal(false,false),1000);
}
}
}
//キーボードのボタンの色を、より優先度の高い色（黒＜紫＜黄＜緑）へ上書き更新する処理
function updateKeyColor(char,newColor){
let currColor=keyColors[char];
let currPri=currColor?colorPriority[currColor]:0;
let newPri=colorPriority[newColor];
if(newPri>currPri){
keyColors[char]=newColor;
let keyBtn=document.getElementById("key-"+char);
if(keyBtn){ keyBtn.classList.remove("correct","present","diacritic","absent"); keyBtn.classList.add(newColor); }
}
}
//今回のヒント（色の結果）を元に、全国の駅名リストをシミュレーションして残り候補駅数を計算・表示
function filterAvailableStations(guess,actualColors,isRestore){
availableStations=availableStations.filter(s=>{
let simColors=evaluateGuess(guess,s.yomi);
for(let i=0;i<rowLength;i++){ if(simColors[i]!==actualColors[i])return false; }
return true;
});
if(guess!==todayStation.yomi && !isRestore){
let count=availableStations.length;
let htmlMsg=`<div style="display:flex; justify-content:center; align-items:center; font-weight:bold; color:#333;">
<div style="width:110px; height:110px; border-radius:50%; background-color:#fff; border:4px solid #6aaa64; display:flex; flex-direction:column; justify-content:center; align-items:center; box-shadow:0 4px 10px rgba(0,0,0,0.3);">
<div style="font-size:11px; letter-spacing:1px;">残り候補</div>
<div style="color:#e53935; font-size:32px; font-weight:900; line-height:1.2;">${count}</div>
<div style="font-size:11px; letter-spacing:1px;">駅</div>
</div>
</div>`;
showMessage(htmlMsg,"transparent","none","none");
}
}


// ==========================================
// メッセージ表示と結果ウィンドウ
// ==========================================

//画面の中央に「〇〇文字入力してください」などの案内ポップアップを一時的に出す
function showMessage(text, bg="rgba(0,0,0,0.85)", border="1px solid rgba(255,255,255,0.2)", shadow="0 8px 16px rgba(0,0,0,0.3)"){
const box=document.getElementById("message-box");
box.innerHTML=text;
box.style.background=bg;
box.style.border=border;
box.style.boxShadow=shadow;
box.classList.remove("hidden");
clearTimeout(msgTimeout); msgTimeout=setTimeout(()=>box.classList.add("hidden"),2000);
}
//ゲーム終了時に、正解の駅名、Wikipediaへのリンク、旅行サイトへの広告、過去の戦績グラフをまとめて表示する大きな画面を作る
function showResultModal(isWin,isRestore){
let st=userStats[currentMode];
if(!st.dist) st.dist=[0,0,0,0,0,0,0,0,0,0];
document.getElementById("modal-title").textContent=isWin?"正解！おめでとう！":"残念！ゲームオーバー";
document.getElementById("modal-desc").textContent=`${todayStation.kanji} (${todayStation.yomi})`;
let safePref=todayStation.pref||"富山県";
let searchKw=typeof isAprilFoolMode!=="undefined"&&isAprilFoolMode?safePref:todayStation.kanji;
let prText=typeof isAprilFoolMode!=="undefined"&&isAprilFoolMode?`＼ 聖地のある「${safePref}」へ巡礼して指の疲れを癒やす ／`:`＼ 正解の駅へ聖地巡礼に行こう！ ／`;
let encodedStation=encodeURIComponent(encodeURIComponent(encodeURIComponent(searchKw)));
let yahooUrl=`https://px.a8.net/svt/ejp?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2&a8ejpredirect=https%3A%2F%2Ftravel.yahoo.co.jp%2FikCo.ashx%3Fcosid%3Dy_a8net%26surl%3Dhttps%253A%252F%252Ftravel.yahoo.co.jp%252Fsearch%253Fadc%253D1%2526discsort%253D1%2526kwd%253D${encodedStation}%2526lc%253D1%2526ppc%253D2%2526rc%253D1%2526si%253D6`;
let yahooImp='<img border="0" width="1" height="1" src="https://www10.a8.net/0.gif?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2" alt="" style="display:none;">';
let rakutenKeyword=encodeURIComponent(encodeURIComponent(searchKw));
let rakutenUrl=`https://af.moshimo.com/af/c/click?a_id=5616621&p_id=55&pc_id=55&pl_id=624&url=https%3A%2F%2Fkw.travel.rakuten.co.jp%2Fkeyword%2FSearch.do%3Fcharset%3Dutf-8%26f_max%3D30%26l-id%3DtopC_search_keyword%26f_query%3D${rakutenKeyword}`;
let rakutenImp='<img src="//i.moshimo.com/af/i/impression?a_id=5616621&p_id=55&pc_id=55&pl_id=624" width="1" height="1" style="border:none;" alt="" loading="lazy">';
document.getElementById("wiki-link-container").innerHTML=`
<div style="margin-bottom:12px;">
<a href="${todayStation.url}" target="_blank" style="display:inline-block; padding:8px 12px; background-color:#e0e0e0; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:12px;">Wikipediaで見る</a>
</div>
<div style="background-color:#fff3e0; border:1px solid #ffcc80; border-radius:6px; padding:10px; margin-bottom:5px;">
<div style="font-size:12px; font-weight:bold; color:#e65100; margin-bottom:8px;">${prText}</div>
<div style="display:flex; justify-content:center; gap:8px; align-items:center; flex-wrap:wrap;">
<a href="${yahooUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#ffffff; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:12px; width:45%;">
<img src="./yahoo_japan_icon_64.svg" alt="Y!" style="height:14px; margin-right:4px; border:none;">トラベル
</a>
<a href="${rakutenUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:0; background-color:#00B900; border:1px solid #00B900; border-radius:4px; width:45%; height:32px; overflow:hidden;">
<img src="./R_Travel_v2.04.svg" alt="楽天トラベル" style="height:100%; border:none;">
</a>
</div>
</div>
${rakutenImp}
${yahooImp}
`;
document.getElementById("stat-played").textContent=st.played;
let winRate=st.played>0?Math.round((st.won/st.played)*100):0;
document.getElementById("stat-winrate").textContent=winRate;
document.getElementById("stat-streak").textContent=st.currentStreak;
document.getElementById("stat-maxstreak").textContent=st.maxStreak;
//何手目で正解できたかの分布データを横向きの棒グラフ（HTMLとCSS）として組み立てて表示する
let distHTML="<div style='font-weight:bold;margin:15px 0 5px;border-bottom:1px solid #ccc;padding-bottom:5px;'>回答回数の分布</div>";
let maxDist=Math.max(...st.dist);
const barColors=["#6aaa64","#42a5f5","#26c6da","#ffca28","#ffa726","#ff7043","#ec407a","#ab47bc"];
for(let i=1;i<=maxGuesses;i++){
let count=st.dist[i]||0;
let w=maxDist>0?Math.max(8,Math.round((count/maxDist)*100)):8;
let bg=barColors[i-1]||"#6aaa64";
distHTML+=`<div style="display:flex;align-items:center;margin-bottom:4px;">
<div style="width:15px;font-weight:bold;text-align:right;margin-right:5px;font-size:12px;">${i}</div>
<div style="flex:1;background-color:#f0f2f5;border-radius:2px;">
<div style="background-color:${bg};height:18px;width:${w}%;color:white;text-align:right;padding-right:5px;font-size:11px;line-height:18px;border-radius:2px;box-sizing:border-box;">${count}</div>
</div>
</div>`;
}
document.getElementById("guess-distribution").innerHTML=distHTML;
//タイルの色の結果を四角い絵文字（🟩🟨🟪⬛）の並びに変換し、結果画面の中央に配置する
const grid=document.getElementById("modal-grid");
let gridHTML=gridHistory.map((row,i)=>{
let r=row.map(c=>colorToEmoji[c]).join("");
return r;
}).join("<br>");
grid.innerHTML=gridHTML;
document.getElementById("result-modal").style.display="flex";
}
//結果画面でシェアボタンが押されたとき、文字と絵文字のパズル結果を組み立てて各SNSの投稿画面を開く
function shareResult(type){
let lastColors=gridHistory.length>0?gridHistory[gridHistory.length-1]:[];
let isWin=lastColors.length>0&&lastColors.every(c=>c==="correct");
let scoreStr=isWin?`${gridHistory.length}/${maxGuesses}`:`X/${maxGuesses}`;
let currentUrl=window.location.href.split('?')[0];
let text=`駅ドル ${currentMode}文字モード ${scoreStr}\n\n`;
text+=gridHistory.map((row,i)=>{
let r=row.map(c=>colorToEmoji[c]).join("");
return (isWin&&i===gridHistory.length-1)?r+"💮":r;
}).join("\n");
text+=`\n\n#駅ドル\n#駅ドル${currentMode}\n${currentUrl}`;
if(type==="twitter"){
let url=`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`; window.open(url,"_blank");
}else if(type==="line"){
let url=`https://line.me/R/msg/text/?${encodeURIComponent(text)}`; window.open(url,"_blank");
}else if(type==="facebook"){
let url=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`; window.open(url,"_blank");
}else if(type==="copy"){
navigator.clipboard.writeText(text).then(()=>showMessage("クリップボードにコピーしました"));
}
}
// すべての画面準備が整った（DOM構築完了）タイミングで一番最初の初期化関数（initGame）を起動させます
window.addEventListener("DOMContentLoaded",initGame);


//11.行事日エフェクト（※anniversaryは書き換える）
//ひな祭りやクリスマス、エイプリルフールなどの行事日に応じた特別な画面演出を実行する
window.triggerEventEffect=(ev)=>{
document.body.className=document.body.className.replace(/event-\w+/g,"");
let c=document.getElementById("event-container");
if(c)c.remove();
if(!ev)return;
document.body.classList.add("event-"+ev);
//4月1日（エイプリルフール）限定の最長文字数モードの処理
if(ev==="aprilfool"){
let mLen=stations.reduce((max,s)=>Math.max(max,s.yomi.length),0);　　　//全ての駅の中から、一番長い読みがなの文字数（例:32文字）を計算して「mLen」に保存する
let longestPool=stations.filter(s=>s.yomi.length===mLen);　　　　　　　//一番長い文字数にぴったり一致する駅（同率1位の駅）を全て集めてリスト「longestPool」を作る
let afSaved=localStorage.getItem("ekiAF_"+currentDayIndex);
let longestSt;
if(afSaved){
longestSt=JSON.parse(afSaved);
}else{
longestSt=longestPool[Math.floor(Math.random()*longestPool.length)];
localStorage.setItem("ekiAF_"+currentDayIndex,JSON.stringify(longestSt));
}
const modeArea=document.querySelector(".mode-btn").parentNode;　　　　 //画面上の文字数を選ぶボタン（4文字、5文字など）が並んでいる場所を探します
//ボタンを並べる場所が見つかり、かつ、まだ最長文字数（32文字など）のボタンが作られていない場合だけ、中の処理に進む
if(modeArea&&!document.getElementById("mode-"+mLen)){
const bMax=document.createElement("button");
bMax.id="mode-"+mLen;bMax.className="mode-btn btn";bMax.innerText=mLen+"文字";
bMax.style.backgroundColor="#e91e63";bMax.style.color="#fff";bMax.style.border="none";
bMax.addEventListener("click",()=>{
document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
bMax.classList.add("active");
isAprilFoolMode=true;　　　//現在エイプリルフールモードで遊んでいるというフラグをオンにする
currentMode=mLen;rowLength=mLen;maxGuesses=4;　　
const gb=document.getElementById("game-board");
gb.style.setProperty("--row-length",mLen);
const afs=document.createElement("style");
afs.id="af-style";
afs.innerHTML=".event-aprilfool #game-board{display:block!important;width:100%!important;max-width:100vw!important;overflow-x:auto!important;padding-bottom:20px!important;box-sizing:border-box!important;}.event-aprilfool .board-row{display:grid!important;grid-template-columns:repeat("+mLen+",60px)!important;gap:5px!important;margin-bottom:5px!important;width:max-content!important;margin-left:auto!important;margin-right:auto!important;padding:0 10px!important;}.event-aprilfool .tile{width:60px!important;height:60px!important;font-size:24px!important;}";
document.head.appendChild(afs);
//最長文字数モードでのプレイ実績と途中経過を保存する場所がまだ無ければ、新しく用意する
if(!userStats[mLen])userStats[mLen]={played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]};
if(!savedState[mLen])savedState[mLen]={board:[],guesses:[],isOver:false,isWin:false,lastDate:""};
todayStation=longestSt;　　//ランダムに選んだ最長駅名を、正解駅としてセットする
restoreBoard();　　　　　　//ゲーム盤とキーボードの表示を、新しくセットした最長文字数モード用にすべてリセットして描き直す
});
modeArea.appendChild(bMax);　　//出来上がった最長文字数ボタンを、画面上のボタンエリアの一番後ろに追加して表示させる
//最長文字数以外の「通常ボタン（4〜6文字）」がクリックされた時の動作を上書きする
document.querySelectorAll(".mode-btn:not(#mode-"+mLen+")").forEach(b=>{
b.addEventListener("click",()=>{
isAprilFoolMode=false;　　　 　//通常モードに戻るため、エイプリルフールモードの目印をオフにします
//エイプリルフールモード用に追加していた特別なデザイン（CSS）を削除して元に戻す
const old=document.getElementById("af-style");
if(old)old.remove();
});
});
//ページを開いた瞬間に、エイプリルフールモードが始まったことを知らせる案内ポップアップ画面（ダイアログ）を作成する
const div=document.createElement("div");
div.style.position="fixed";div.style.top="50%";div.style.left="50%";div.style.transform="translate(-50%,-50%)";
div.style.background="#fff";div.style.border="4px solid #e91e63";div.style.padding="25px";div.style.zIndex="10000";
div.style.borderRadius="12px";div.style.textAlign="center";div.style.color="#333";div.style.boxShadow="0 4px 15px rgba(0,0,0,0.3)";
div.style.width="85%";div.style.maxWidth="400px";
div.innerHTML="<h2 style='color:#e91e63;margin-top:0;'>駅ドルへようこそ！</h2><p style='font-size:16px;line-height:1.6;'>本日はエイプリルフール。</p><p style='font-size:16px;line-height:1.6;'>日本一長い駅名（"+mLen+"文字）を当てる<br><b>超・鬼畜モード</b>が解禁されました！</p><p style='font-size:14px;color:#555;'>画面上の「"+mLen+"文字」ボタンから挑戦できます。<br>横にスクロールして全文字を入力してください。<br>（※回答回数は特別に <b>4回</b> です）</p><button id='close-af-btn' class='btn' style='background:#e91e63;color:#fff;margin-top:15px;font-size:18px;'>挑戦する</button>";
document.body.appendChild(div);
document.getElementById("close-af-btn").addEventListener("click",()=>div.remove());
}
}
//クリスマスには雪、ひな祭りには桜など、画面の上からパラパラと絵文字のパーティクルを降らせる共通演出処理
if(["newyear","hinamatsuri","kodomo","tanabata","nye","anniversary","christmas","valentine","halloween","railway"].includes(ev)){
c=document.createElement("div");c.id="event-container";document.body.appendChild(c);
let char=Math.random()>0.5?"❄️":"🎄";
if(ev==="hinamatsuri"||ev==="anniversary")char="🌸";
if(ev==="newyear")char="🎍";if(ev==="kodomo")char="🎏";if(ev==="tanabata")char="🎋";if(ev==="nye")char="🔔";
if(ev==="valentine")char=Math.random()>0.5?"💖":"🍫";if(ev==="halloween")char=Math.random()>0.5?"🎃":"🦇";if(ev==="railway")char=Math.random()>0.5?"🚄":"🚃";
for(let i=0;i<30;i++){
let p=document.createElement("div");p.className="particle";p.innerText=char;
p.style.left=Math.random()*100+"vw";p.style.animationDuration=(Math.random()*4+3)+"s";
p.style.fontSize=(Math.random()*15+15)+"px";p.style.opacity=Math.random()*0.5+0.5;c.appendChild(p);
}
setTimeout(()=>{if(c)c.remove();},8000);
}
};
//現在の日付を取得して、今日が何か特別な「行事日」に該当するかどうかを毎日チェックする
const checkSpecialEvent=()=>{
const d=new Date();const m=d.getMonth()+1;const day=d.getDate();
let ev="";
if(m===1&&day<=3)ev="newyear";
else if(m===2&&day===14)ev="valentine";
else if(m===3&&day===3)ev="hinamatsuri";
else if(m===4&&day===1)ev="aprilfool";
else if(m===5&&day===5)ev="kodomo";
else if(m===6&&day===4)ev="anniversary";
else if(m===7&&day===7)ev="tanabata";
else if(m===10&&day===14)ev="railway";
else if(m===10&&day===31)ev="halloween";
else if(m===12&&(day===24||day===25))ev="christmas";
else if(m===12&&day===31)ev="nye";
window.triggerEventEffect(ev);
};


// ==========================================
// 実績カウンター
// ==========================================

// プレイヤーが正解（クリア）した瞬間に、すべての実績データを一斉に計算して更新する関数
function incrementClearAchievements(actualGuesses, clearTimeMs) {
  // 保存されている実績データを読み込み、無ければ初期構造を作ります
  let ach = JSON.parse(localStorage.getItem("ekiAchievements") || '{"bestScores":{},"counters":{"legendStationClears":0,"noAbsentClears":0,"totalYomiLength":0,"noHintClears":0,"hintUsedClears":0,"totalSubmitCount":0},"winStreak":{"currentStreak":0,"maxStreak":0,"lastClearedDate":""},"hourlyClears":{},"unlockedSets":{"prefs":[],"companies":[],"lines":[],"clearedEvents":[],"clearedMonthDays":[],"clearedStationNames":[]}}');
  
  // --- 1. 将来のモード（3文字、7文字など）に自動対応する処理 ---
  if (!ach.bestScores[currentMode]) {
    ach.bestScores[currentMode] = { "minGuesses": 8, "bestTimeMs": 9999999 };
  }
  
  // --- 2. 最小手数と最速クリアタイムの更新 ---
  if (actualGuesses < ach.bestScores[currentMode].minGuesses) {
    ach.bestScores[currentMode].minGuesses = actualGuesses;
  }
  if (clearTimeMs < ach.bestScores[currentMode].bestTimeMs) {
    ach.bestScores[currentMode].bestTimeMs = clearTimeMs;
  }
  
  // --- 3. 24時間タイマー（時間帯）の集計 ---
  // 現在の「時（0〜23）」を取得し、該当する時間帯のクリア回数を1増やします
  const now = new Date();
  const hour = String(now.getHours());
  ach.hourlyClears[hour] = (ach.hourlyClears[hour] || 0) + 1;
  
  // --- 4. カウンター系（開業年・読み仮名数・送信数・ヒント関連）の集計 ---
  // 正解した駅名の読み仮名の文字数を累計に加算します
  ach.counters.totalYomiLength += todayStation.yomi.length;
  
  // 1900年以前の明治生まれの古い駅を正解した場合
  if (parseInt(todayStation.open_year, 10) <= 1900) {
    ach.counters.legendStationClears++; 
  }
  
  // 今回のプレイで黒（灰タイル）を一度も出さずにストレートクリアした場合
  let isNoAbsent = gridHistory[gridHistory.length - 1].every(c => c !== "absent");
  if (isNoAbsent) {
    ach.counters.noAbsentClears++; 
  }
  
  // 今回のプレイでヒントを使ったかどうかを判定し、それぞれのカウンターを増やします
  if (savedState[currentMode] && savedState[currentMode].usedHint === false) {
    ach.counters.noHintClears++; // ノーヒントでクリアした回数
  } else {
    ach.counters.hintUsedClears++; // ヒントを使ってクリアした回数
  }
  
  // 累計回答送信回数に、今回のクリアまでにかかった手数を加算します
  ach.counters.totalSubmitCount += actualGuesses; 
  
  // --- 5. 通算連勝（1日3回クリアに対応する日付スタンプ判定） ---
  const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  // 最後にクリアした日が「今日」以外の場合のみ、連勝の計算を行います
  if (ach.winStreak.lastClearedDate !== todayStr) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, '0') + "-" + String(yesterday.getDate()).padStart(2, '0');
    
    // 最後にクリアした日が「昨日」であれば連勝を伸ばし、それ以外なら1日にリセットします
    if (ach.winStreak.lastClearedDate === yesterdayStr) {
      ach.winStreak.currentStreak++; 
    } else {
      ach.winStreak.currentStreak = 1; 
    }
    
    // 最高連勝記録を上回った場合はデータを塗り替えます
    if (ach.winStreak.currentStreak > ach.winStreak.maxStreak) {
      ach.winStreak.maxStreak = ach.winStreak.currentStreak;
    }
    ach.winStreak.lastClearedDate = todayStr; // 最終クリア日を今日に更新します
  }
  
  // --- 6. コレクション要素（都道府県・事業者・路線・駅名・月日）の集計 ---
  // 配列（リスト）の中にまだ存在しない場合のみ、新しく追加（push）します
  //都道府県
  //if (todayStation.pref && !ach.unlockedSets.prefs.includes(todayStation.pref)) {
  //  ach.unlockedSets.prefs.push(todayStation.pref);
  //}
  //所属事業者
  //if (todayStation.companies) {
  //  todayStation.companies.forEach(c => {
  //    if (!ach.unlockedSets.companies.includes(c)) ach.unlockedSets.companies.push(c);
  //  });
  //}
  //所属路線
  //if (todayStation.lines) {
  //  todayStation.lines.forEach(l => {
  //    if (!ach.unlockedSets.lines.includes(l)) ach.unlockedSets.lines.push(l);
  //  });
  //}
  if (!ach.unlockedSets.clearedStationNames.includes(todayStation.kanji)) {
    ach.unlockedSets.clearedStationNames.push(todayStation.kanji); // 駅名（新幹線全制覇などの判定用）
  }
  
  // 毎月1日や周年記念などの判定用に、月日のスタンプ（例：06-05）を保存します
  const monthDayStr = String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  if (!ach.unlockedSets.clearedMonthDays.includes(monthDayStr)) {
    ach.unlockedSets.clearedMonthDays.push(monthDayStr); 
  }
  
  // --- 7. 行事日イベント名の集計 ---
  // 画面のクラス名から現在のイベント名（christmasなど）を取得して保存します
  const currentEvent = document.body.className.match(/event-(\w+)/);
  if (currentEvent && currentEvent[1]) {
    const evName = currentEvent[1];
    if (!ach.unlockedSets.clearedEvents.includes(evName)) {
      ach.unlockedSets.clearedEvents.push(evName); 
    }
  }
  
  // 最後に、新しく計算し終わった実績データをLocalStorageに一括で上書き保存します
  localStorage.setItem("ekiAchievements", JSON.stringify(ach));
  
  // --- 8. クリア済みインデックスの記録（文字数モード別） ---
  let clearedData = JSON.parse(localStorage.getItem("ekiClearedDays") || '{"4":[],"5":[],"6":[]}');
  if (!clearedData[currentMode]) clearedData[currentMode] = [];
  if (!clearedData[currentMode].includes(currentDayIndex)) {
    clearedData[currentMode].push(currentDayIndex);
    clearedData[currentMode].sort((a, b) => a - b);
    localStorage.setItem("ekiClearedDays", JSON.stringify(clearedData));
  }
}
