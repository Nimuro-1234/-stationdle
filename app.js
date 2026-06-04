let stations=[];
let availableStations=[];
let todayStation=null;
let currentGuess="";
let guessesSubmitted=0;
let maxGuesses=8;
let rowLength=4;
let currentMode=4;
let keyColors={};
let gridHistory=[];
let debugOffset=0;
let msgTimeout=null;
let currentDayIndex=0;
let isAprilFoolMode=false;
let savedState={};
let userStats={
4:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]},
5:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]},
6:{played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]}
};
let dailyArchive={};
const colorPriority={"correct":4,"present":3,"diacritic":2,"absent":1};
const colorToEmoji={"correct":"🟩","present":"🟨","diacritic":"🟪","absent":"⬛"};
const baseMap={
"が":"か","ぎ":"き","ぐ":"く","げ":"け","ご":"こ",
"ざ":"さ","じ":"し","ず":"す","ぜ":"せ","ぞ":"そ",
"だ":"た","ぢ":"ち","づ":"つ","で":"て","ど":"と",
"ば":"は","び":"ひ","ぶ":"ふ","べ":"へ","ぼ":"ほ",
"ぱ":"は","ぴ":"ひ","ぷ":"ふ","ぺ":"へ","ぽ":"ほ",
"ぁ":"あ","ぃ":"い","ぅ":"う","ぇ":"え","ぉ":"お",
"っ":"つ","ゃ":"や","ゅ":"ゆ","ょ":"よ","ゎ":"わ"
};
const seionGroups=[
["あ","い","う","え","お"],["か","き","く","け","こ"],["さ","し","す","せ","そ"],
["た","ち","つ","て","と"],["な","に","ぬ","ね","の"],["は","ひ","ふ","へ","ほ"],
["ま","み","む","め","も"],["や","","ゆ","","よ"],["ら","り","る","れ","ろ"],["わ","ー","を","","ん"]
];
const dakuonGroups=[
["が","ぎ","ぐ","げ","ご"],["ざ","じ","ず","ぜ","ぞ"],["だ","ぢ","づ","で","ど"],
["ば","び","ぶ","べ","ぼ"],["ぱ","ぴ","ぷ","ぺ","ぽ"],["ぁ","ぃ","ぅ","ぇ","ぉ"],
["ゃ","","ゅ","","ょ"],["っ","","ゎ","",""]
];

function getBaseChar(c){return baseMap[c]||c;}

function toHiragana(str){ return str.replace(/[ァ-ン]/g,m=>String.fromCharCode(m.charCodeAt(0)-0x60)); }

async function initGame(){
try{
loadStats();
const res=await fetch('stations.json');
const raw=await res.json();
stations=raw.filter(s=>!(s.companies&&s.companies.length===1&&s.companies[0]==="日本貨物鉄道")).map(s=>({...s,yomi:toHiragana(s.yomi)}));
if(stations.length===0)return;
document.getElementById("enter-btn").addEventListener("click",()=>handleKeyPress("ENTER"));
document.getElementById("back-btn").addEventListener("click",()=>handleKeyPress("BACK"));
document.getElementById("clear-btn").addEventListener("click",()=>handleKeyPress("CLEAR"));
document.getElementById("menu-btn").addEventListener("click",()=>{
document.getElementById("side-menu-overlay").style.display="block";
setTimeout(()=>document.getElementById("side-menu").style.right="0",10);
});
const closeSideMenu=()=>{
document.getElementById("side-menu").style.right="-250px";
setTimeout(()=>document.getElementById("side-menu-overlay").style.display="none",300);
};
document.getElementById("close-menu-btn").addEventListener("click",closeSideMenu);
document.getElementById("side-menu-overlay").addEventListener("click",closeSideMenu);
document.getElementById("help-btn").addEventListener("click",()=>{
document.getElementById("help-modal").style.display="flex";
});
document.getElementById("close-help-btn").addEventListener("click",()=>{
document.getElementById("help-modal").style.display="none";
});
document.getElementById("stats-btn").addEventListener("click",()=>{
if(savedState[currentMode].isOver) showResultModal(savedState[currentMode].isWin, true);
else showMessage("ゲームクリア後に見ることができます");
});
[4,5,6].forEach(num=>{
document.getElementById(`mode-${num}`).addEventListener("click",()=>{
document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
document.getElementById(`mode-${num}`).classList.add("active");
currentMode=num; rowLength=num; maxGuesses=(num===4)?8:6;
document.getElementById("game-board").style.setProperty("--row-length",num);
selectTodayStation(); restoreBoard();
});
});
document.getElementById("share-btn").addEventListener("click",()=>shareResult("twitter"));
document.getElementById("line-btn").addEventListener("click",()=>shareResult("line"));
document.getElementById("fb-btn").addEventListener("click",()=>shareResult("facebook"));
document.getElementById("copy-btn").addEventListener("click",()=>shareResult("copy"));
document.getElementById("close-modal-btn").addEventListener("click",()=>{
document.getElementById("result-modal").style.display="none";
});
const themes=["","theme-dark","theme-sakura","theme-ocean","theme-green","theme-orange","theme-red","theme-blue","theme-purple"];
let themeIdx=0;
const savedTheme=localStorage.getItem("ekiTheme");
if(savedTheme){
themeIdx=themes.indexOf(savedTheme);
if(themeIdx>-1&&savedTheme!=="")document.body.classList.add(savedTheme);
}
document.getElementById("theme-btn").addEventListener("click",()=>{
document.body.className=document.body.className.replace(/event-\w+/g,"");
if(themes[themeIdx]!=="")document.body.classList.remove(themes[themeIdx]);
themeIdx=(themeIdx+1)%themes.length;
if(themes[themeIdx]!=="")document.body.classList.add(themes[themeIdx]);
localStorage.setItem("ekiTheme",themes[themeIdx]);
});
selectTodayStation(); restoreBoard(); checkSpecialEvent();
}catch(e){ console.error("データエラー:",e); }
}

function loadStats(){
const saved=localStorage.getItem("ekiPuzzleStatsV2");
if(saved) userStats=JSON.parse(saved);
}

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

function loadArchive(){
const saved=localStorage.getItem("ekiPuzzleArchiveV1");
if(saved) dailyArchive=JSON.parse(saved);
}

function saveToArchive(){
if(!dailyArchive[currentDayIndex]) dailyArchive[currentDayIndex]={};
dailyArchive[currentDayIndex][currentMode]={kanji:todayStation.kanji, yomi:todayStation.yomi};
localStorage.setItem("ekiPuzzleArchiveV1",JSON.stringify(dailyArchive));
}

function loadGameState(dayIdx){
const saved=localStorage.getItem("ekiPuzzleStateV1");
if(saved){
let parsed=JSON.parse(saved);
if(parsed.date===String(dayIdx)){ savedState=parsed; return; }
}
savedState={ date:String(dayIdx), 4:{guesses:[],isWin:false,isOver:false}, 5:{guesses:[],isWin:false,isOver:false}, 6:{guesses:[],isWin:false,isOver:false} };
localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState));
}

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

function selectTodayStation(){
const modeStations=stations.filter(s=>s.yomi.length===currentMode);
if(modeStations.length===0){
alert(`エラー: ${currentMode}文字の駅データが見つかりません。`);
todayStation={kanji:"えらー",yomi:"えらー"}; return;
}
const t=new Date();
const tDate=new Date(t.getFullYear(),t.getMonth(),t.getDate());
const baseDate=new Date(2024,0,1);
currentDayIndex=Math.round((tDate-baseDate)/86400000)+debugOffset;
loadGameState(currentDayIndex);
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
console.log(`※${currentMode}文字の答え:`,todayStation.kanji,todayStation.yomi);
}

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

function createKey(char){
let btn=document.createElement("button");
btn.textContent=char;
btn.className="key";
btn.id="key-"+char;
btn.addEventListener("click",()=>handleKeyPress(char));
return btn;
}

function handleKeyPress(char){
if(savedState[currentMode].isOver||guessesSubmitted>=maxGuesses)return;
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

function updateTiles(){
for(let j=0;j<rowLength;j++){
const tile=document.getElementById(`row-${guessesSubmitted}-tile-${j}`);
tile.textContent=currentGuess[j]||"";
}
}

function evaluateGuess(guess,target){
let results=new Array(rowLength).fill("absent");
let targetArr=target.split(""); let guessArr=guess.split(""); let targetCounts={};
for(let c of targetArr)targetCounts[c]=(targetCounts[c]||0)+1;
for(let i=0;i<rowLength;i++){
if(guessArr[i]===targetArr[i]){ results[i]="correct"; targetCounts[guessArr[i]]--; }
}
for(let i=0;i<rowLength;i++){
if(results[i]==="correct")continue;
let c=guessArr[i];
if(targetCounts[c]>0){ results[i]="present"; targetCounts[c]--; }
}
let baseTargetCounts={};
for(let char in targetCounts){
if(targetCounts[char]>0){ let bc=getBaseChar(char); baseTargetCounts[bc]=(baseTargetCounts[bc]||0)+targetCounts[char]; }
}
for(let i=0;i<rowLength;i++){
if(results[i]!=="absent")continue;
let bg=getBaseChar(guessArr[i]);
if(baseTargetCounts[bg]>0){ results[i]="diacritic"; baseTargetCounts[bg]--; }
}
return results;
}

function submitGuess(isRestore=false){
const isValid=stations.filter(s=>s.yomi.length===currentMode).some(s=>s.yomi===currentGuess);
if(!isValid){ if(!isRestore)showMessage("実在しない駅名です"); return; }
let st=savedState[currentMode];
if(!isRestore){ st.guesses.push(currentGuess); localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState)); }
const resultColors=evaluateGuess(currentGuess,todayStation.yomi);
gridHistory.push(resultColors);
for(let j=0;j<rowLength;j++){
const tile=document.getElementById(`row-${guessesSubmitted}-tile-${j}`);
tile.textContent=currentGuess[j];
tile.classList.add(resultColors[j]);
const char=currentGuess[j]; const color=resultColors[j];
updateKeyColor(char,color);
if(color==="absent"){
let base=getBaseChar(char);
let targetBaseChars=todayStation.yomi.split("").map(getBaseChar);
if(!targetBaseChars.includes(base)){
let variants=Object.keys(baseMap).filter(k=>baseMap[k]===base);
variants.push(base); variants.forEach(v=>updateKeyColor(v,"absent"));
}
}
}
filterAvailableStations(currentGuess,resultColors,isRestore);
if(currentGuess===todayStation.yomi){
let actualGuesses=guessesSubmitted+1;
guessesSubmitted=maxGuesses;
if(!isRestore){
st.isOver=true; st.isWin=true; saveStats(true,actualGuesses); localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState));
let winHtml=`<div style="font-size:24px; font-weight:bold; color:#fff; letter-spacing:2px;">正解！🎉</div>`;
showMessage(winHtml,"#ff9800","none","0 4px 10px rgba(0,0,0,0.3)");
setTimeout(()=>{ showResultModal(true,false); },2000);
}
return;
}
guessesSubmitted++;
if(!isRestore) currentGuess="";
if(guessesSubmitted===maxGuesses){
if(!isRestore){
st.isOver=true; st.isWin=false; saveStats(false,0); localStorage.setItem("ekiPuzzleStateV1",JSON.stringify(savedState));
setTimeout(()=>showResultModal(false,false),1000);
}
}
}

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

function showMessage(text, bg="rgba(0,0,0,0.85)", border="1px solid rgba(255,255,255,0.2)", shadow="0 8px 16px rgba(0,0,0,0.3)"){
const box=document.getElementById("message-box");
box.innerHTML=text;
box.style.background=bg;
box.style.border=border;
box.style.boxShadow=shadow;
box.classList.remove("hidden");
clearTimeout(msgTimeout); msgTimeout=setTimeout(()=>box.classList.add("hidden"),2000);
}

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
const grid=document.getElementById("modal-grid");
let gridHTML=gridHistory.map((row,i)=>{
let r=row.map(c=>colorToEmoji[c]).join("");
return (isWin&&i===gridHistory.length-1)?r+"💮":r;
}).join("<br>");
grid.innerHTML=gridHTML;
document.getElementById("result-modal").style.display="flex";
}

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
window.addEventListener("DOMContentLoaded",initGame);

//行事日エフェクト（※anniversaryは書き換える）
window.triggerEventEffect=(ev)=>{
document.body.className=document.body.className.replace(/event-\w+/g,"");
let c=document.getElementById("event-container");
if(c)c.remove();
if(!ev)return;
document.body.classList.add("event-"+ev);
if(ev==="aprilfool"){
let mLen=stations.reduce((max,s)=>Math.max(max,s.yomi.length),0);
let longestPool=stations.filter(s=>s.yomi.length===mLen);
let longestSt=longestPool[currentDayIndex%longestPool.length];
const modeArea=document.querySelector(".mode-btn").parentNode;
if(modeArea&&!document.getElementById("mode-"+mLen)){
const bMax=document.createElement("button");
bMax.id="mode-"+mLen;bMax.className="mode-btn btn";bMax.innerText=mLen+"文字";
bMax.style.backgroundColor="#e91e63";bMax.style.color="#fff";bMax.style.border="none";
bMax.addEventListener("click",()=>{
document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
bMax.classList.add("active");
isAprilFoolMode=true;
currentMode=mLen;rowLength=mLen;maxGuesses=5;
const gb=document.getElementById("game-board");
gb.style.setProperty("--row-length",mLen);
const afs=document.createElement("style");
afs.id="af-style";
afs.innerHTML=".event-aprilfool #game-board{display:block!important;width:100%!important;max-width:100vw!important;overflow-x:auto!important;padding-bottom:20px!important;box-sizing:border-box!important;}.event-aprilfool .board-row{display:grid!important;grid-template-columns:repeat("+mLen+",minmax(35px,50px))!important;gap:5px!important;margin-bottom:5px!important;width:max-content!important;margin-left:auto!important;margin-right:auto!important;padding:0 10px!important;}";
document.head.appendChild(afs);
if(!userStats[mLen])userStats[mLen]={played:0,won:0,currentStreak:0,maxStreak:0,dist:[0,0,0,0,0,0,0,0,0,0]};
if(!savedState[mLen])savedState[mLen]={board:[],guesses:[],isOver:false,isWin:false,lastDate:""};
todayStation=longestSt;
restoreBoard();
});
modeArea.appendChild(bMax);
document.querySelectorAll(".mode-btn:not(#mode-"+mLen+")").forEach(b=>{
b.addEventListener("click",()=>{
isAprilFoolMode=false;
const old=document.getElementById("af-style");
if(old)old.remove();
});
});
const div=document.createElement("div");
div.style.position="fixed";div.style.top="50%";div.style.left="50%";div.style.transform="translate(-50%,-50%)";
div.style.background="#fff";div.style.border="4px solid #e91e63";div.style.padding="25px";div.style.zIndex="10000";
div.style.borderRadius="12px";div.style.textAlign="center";div.style.color="#333";div.style.boxShadow="0 4px 15px rgba(0,0,0,0.3)";
div.style.width="85%";div.style.maxWidth="400px";
div.innerHTML="<h2 style='color:#e91e63;margin-top:0;'>駅ドルへようこそ！</h2><p style='font-size:16px;line-height:1.6;'>本日はエイプリルフール。</p><p style='font-size:16px;line-height:1.6;'>日本一長い駅名（"+mLen+"文字）を当てる<br><b>超・鬼畜モード</b>が解禁されました！</p><p style='font-size:14px;color:#555;'>画面上の「"+mLen+"」ボタンから挑戦できます。<br>横にスクロールして全文字を入力してください。<br>（※回答回数は特別に <b>5回</b> です）</p><button id='close-af-btn' class='btn' style='background:#e91e63;color:#fff;margin-top:15px;font-size:18px;'>挑戦する</button>";
document.body.appendChild(div);
document.getElementById("close-af-btn").addEventListener("click",()=>div.remove());
}
}
if(["newyear","hinamatsuri","kodomo","tanabata","nye","anniversary","christmas","valentine","halloween","railway"].includes(ev)){
c=document.createElement("div");c.id="event-container";document.body.appendChild(c);
let char="❄️";
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
