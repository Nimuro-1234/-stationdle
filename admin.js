const adminPanel=document.createElement('div');
adminPanel.id='admin-panel';
adminPanel.style.padding='10px';
adminPanel.style.background='#ffebee';
adminPanel.style.border='2px solid #f44336';
adminPanel.style.marginBottom='15px';
adminPanel.innerHTML=`
<b>🛠 管理者モード</b><br>
現在の答え: <span id="debug-ans-text">（読込中...）</span><br>
<input type="text" id="admin-custom-ans" placeholder="新しい答え(ひらがな)" style="padding:4px;margin-right:5px;">
<button id="admin-set-btn" style="margin-right:5px;">確定変更</button>
<button id="admin-rand-btn" style="margin-right:5px;">ランダム変更</button>
<button id="admin-reset-btn" style="margin-right:5px;">入力値リセット</button>
<button id="admin-stats-wipe-btn" style="background-color:#ffe6e6; color:#c62828; border:1px solid #c62828;">戦績全消去</button>
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
