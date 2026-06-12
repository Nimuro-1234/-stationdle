// ==========================================
// 距離と方角の計算ロジック（ハバサイン公式）
// ==========================================

// 地球の丸みを考慮して、2つの地点（緯度・経度）の直線距離（km）を正確に計算する関数
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球の半径（km）
  // 角度（度）をラジアン（数学用の単位）に変換します
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  // ハバサイン公式という球面三角法の計算式です
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  // 距離を計算し、小数第1位まで（例：12.5）丸めて返します
  const distance = R * c;
  return Math.round(distance * 10) / 10;
}

// 2つの地点（緯度・経度）から、「入力した駅」から見た「正解の駅」の8方位（矢印）を計算する関数
function calculateDirection(lat1, lon1, lat2, lon2) {
  // 距離が近すぎる（1km未満）場合は、その場所（🎯）とみなします
  if (calculateDistance(lat1, lon1, lat2, lon2) < 1.0) {
    return "🎯";
  }

  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);

  // 方位角を計算する公式です
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * (180 / Math.PI);
  
  // 角度を0〜360度に整えます
  brng = (brng + 360) % 360;

  // 角度を45度刻みで8つの方角に分け、対応する絵文字の矢印を返します
  const directions = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
  const index = Math.round(brng / 45) % 8;
  return directions[index];
}

// （テスト用のコード：不要になったら消してください）
// 東京駅（緯度 35.6812, 経度 139.7671）から、大阪駅（緯度 34.7024, 経度 135.4959）への距離と方角
// console.log("距離:", calculateDistance(35.6812, 139.7671, 34.7024, 135.4959), "km");
// console.log("方角:", calculateDirection(35.6812, 139.7671, 34.7024, 135.4959));


// ==========================================
// サジェスト（検索候補表示）ロジック
// ==========================================

let locaStations = []; // 全駅データを入れる箱（後で stations.json から読み込みます）
let selectedSuggestIndex = -1; // キーボードの上下キーで選んでいる行の番号
let currentSelectedStation = null; // プレイヤーがリストから選んだ「送信待ち」の駅データ

// カタカナをひらがなに変換する関数（「ヤマテセン」などで検索された時の対策）
function toHiragana(str) {
  return str.replace(/[ァ-ン]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
}

// サジェスト機能の初期設定（画面読み込み時に1回だけ実行します）
function setupSuggest() {
  const input = document.getElementById("station-search-input");
  const list = document.getElementById("suggest-list");

  // 【1】文字が入力されるたびに実行される処理
  input.addEventListener("input", (e) => {
    // 入力された文字の空白を消し、ひらがなに統一する
    const query = toHiragana(e.target.value.trim());
    selectedSuggestIndex = -1; 
    currentSelectedStation = null;

    // 入力が空っぽならリストを隠して終了
    if (!query) {
      list.style.display = "none";
      return;
    }

    // 絞り込み処理（for文で高速に回す）
    const results = [];
    for (let i = 0; i < locaStations.length; i++) {
      const s = locaStations[i];
      let matchReason = "";

      // ① 駅名（漢字・ひらがな）での一致
      if (s.kanji.includes(query) || s.yomi.includes(query)) {
        matchReason = `${s.pref}${s.municipality}`; // 駅名ヒット時は住所を添える
      }
      // ② 住所（市区町村）での一致
      else if ((s.pref + s.municipality + (s.ward || "")).includes(query)) {
        matchReason = `📍 ${s.pref}${s.municipality}`;
      }
      // ③ 路線名での一致
      else if (s.lines && s.lines.some(l => l.includes(query) || toHiragana(l).includes(query))) {
        const matchedLine = s.lines.find(l => l.includes(query) || toHiragana(l).includes(query));
        matchReason = `🚃 ${matchedLine}`;
      }
      // ④ 事業者名での一致
      else if (s.companies && s.companies.some(c => c.includes(query) || toHiragana(c).includes(query))) {
        const matchedComp = s.companies.find(c => c.includes(query) || toHiragana(c).includes(query));
        matchReason = `🏢 ${matchedComp}`;
      }

      // 何らかの条件にヒットした場合、結果リストに追加
      if (matchReason !== "") {
        results.push({ station: s, reason: matchReason });
        // 動作を限界まで軽くするため、候補は最大50件でストップ
        if (results.length >= 50) break; 
      }
    }

    // HTMLの生成
    renderSuggestList(results);
  });

  // 【2】キーボード操作（上下キーとエンター）の処理
  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll("li");
    if (items.length === 0 || list.style.display === "none") return;

    if (e.key === "ArrowDown") {
      e.preventDefault(); // カーソルが文末に移動するのを防ぐ
      selectedSuggestIndex = Math.min(selectedSuggestIndex + 1, items.length - 1);
      updateSuggestSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSuggestIndex = Math.max(selectedSuggestIndex - 1, 0);
      updateSuggestSelection(items);
    } else if (e.key === "Enter") {
      e.preventDefault(); // フォームの誤送信を防ぐ
      
      if (selectedSuggestIndex >= 0) {
        // サジェストを上下キーで選んでいる途中なら、それを「クリック」した扱いに設定
        items[selectedSuggestIndex].click();
      } else {
        // サジェストを選んでいない（手打ち状態）なら、送信ボタンを押した扱いに設定
        document.getElementById("submit-guess-btn").click();
      }
    }
  });

  // 【3】画面外をクリックしたらサジェストをパッと閉じる
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.style.display = "none";
    }
  });
}

// 絞り込んだ結果をHTML（ドロップダウンリスト）として描画する関数
function renderSuggestList(results) {
  const list = document.getElementById("suggest-list");
  const input = document.getElementById("station-search-input");
  list.innerHTML = "";

  if (results.length === 0) {
    list.style.display = "none";
    return;
  }

  results.forEach((item, index) => {
    const li = document.createElement("li");
    // 駅名と、ヒットした理由（住所や路線名）を左右に分けて表示
    li.innerHTML = `
      <span style="font-weight:bold; color:#2c3e50;">${item.station.kanji}</span>
      <span class="suggest-sub">${item.reason}</span>
    `;
    
    // 候補がクリック（またはエンターで選択）された時の処理
    li.addEventListener("click", () => {
      input.value = item.station.kanji; // 入力欄を駅名で上書き
      list.style.display = "none";      // リストを隠す
      currentSelectedStation = item.station; // 【重要】選んだ駅の「完全なデータ」を記憶しておく
      input.blur(); // スマホのソフトウェアキーボードを閉じる
    });

    list.appendChild(li);
  });

  list.style.display = "block";
}

// 上下キーで選択された行の色を変え、自動でスクロール追従させる処理
function updateSuggestSelection(items) {
  items.forEach(item => item.classList.remove("selected"));
  if (selectedSuggestIndex >= 0) {
    const selectedItem = items[selectedSuggestIndex];
    selectedItem.classList.add("selected");
    selectedItem.scrollIntoView({ block: "nearest" });
  }
}


// ==========================================
// メインゲームロジック（正誤判定と結果表示）
// ==========================================

let todayLocaStation = null; // 今日の正解駅
let locaGuessesCount = 0;    // 現在の回答回数
const MAX_LOCA_GUESSES = 10; // 最大回答回数

// 属性（事業者や路線）の配列を比較し、緑・黄・黒のステータスを返す関数
function checkArrayMatch(guessArr, targetArr) {
  if (!guessArr || guessArr.length === 0 || !targetArr || targetArr.length === 0) return "cell-absent";
  
  // 完全に一致（配列の長さが同じで、中身も全て同じ）
  const isExactMatch = guessArr.length === targetArr.length && guessArr.every(item => targetArr.includes(item));
  if (isExactMatch) return "cell-correct";
  
  // 部分一致（1つでも共通するものがある）
  const isPartialMatch = guessArr.some(item => targetArr.includes(item));
  if (isPartialMatch) return "cell-present";
  
  // 共通なし
  return "cell-absent";
}

// プレイヤーが「送信」ボタンを押したときの処理
function submitLocaGuess() {
  const input = document.getElementById("station-search-input");
  
  if (!currentSelectedStation) {
    alert("リストから駅を選択してください。");
    return;
  }
  if (locaGuessesCount >= MAX_LOCA_GUESSES) {
    alert("すでに規定の回数に達しています！");
    return;
  }

  const guess = currentSelectedStation;
  const target = todayLocaStation;

  // ① 距離と方角の計算
  const distance = calculateDistance(guess.latitude, guess.longitude, target.latitude, target.longitude);
  const direction = calculateDirection(guess.latitude, guess.longitude, target.latitude, target.longitude);

  // ② 【重要】同一駅判定（Wikipediaのページが同じ、または座標が完全に一致）
  // ※距離による曖昧な判定を排除し、「データ元が同じ駅」のみを完全正解とする
  const isWin = (guess.kanji === target.kanji) || 
                (guess.url === target.url && guess.url !== "") || 
                (guess.latitude === target.latitude && guess.longitude === target.longitude);

  // ③ 地域の判定（都道府県・市区町村）
  let regionStatus = "cell-absent";
  if (guess.pref === target.pref) {
    regionStatus = guess.municipality === target.municipality ? "cell-correct" : "cell-present";
  }

  // ④ 事業者と路線の判定
  let compStatus = checkArrayMatch(guess.companies, target.companies);
  let lineStatus = checkArrayMatch(guess.lines, target.lines);

  // もし完全正解（Bingo）なら、細かい属性の違いは無視して全て緑（🟩）で祝福する
  if (isWin) {
    regionStatus = "cell-correct";
    compStatus = "cell-correct";
    lineStatus = "cell-correct";
  }

  // ⑤ 結果をHTMLの表に1行追加する
  renderResultRow(guess, distance, direction, regionStatus, compStatus, lineStatus, isWin);

  locaGuessesCount++;
  
  // 入力欄をリセット
  input.value = "";
  currentSelectedStation = null;
  document.getElementById("suggest-list").style.display = "none";

  // 勝敗のチェック
  if (isWin) {
    setTimeout(() => alert(`正解！🎉 ${locaGuessesCount}手目で「${target.kanji}」を探し当てました！`), 300);
  } else if (locaGuessesCount >= MAX_LOCA_GUESSES) {
    setTimeout(() => alert(`ゲームオーバー… 正解は「${target.kanji}」でした。`), 300);
  }
}

// 結果をテーブルの1行（<tr>）として組み立てて画面に出す関数
function renderResultRow(guess, distance, direction, regionStatus, compStatus, lineStatus, isWin) {
  const tbody = document.getElementById("results-tbody");
  const tr = document.createElement("tr");

  // 事業者と路線の表示テキストを作る（長すぎる場合は「〇〇 他」と省略する工夫）
  const compText = (guess.companies && guess.companies.length > 0) ? guess.companies[0] + (guess.companies.length > 1 ? " 他" : "") : "不明";
  const lineText = (guess.lines && guess.lines.length > 0) ? guess.lines[0] + (guess.lines.length > 1 ? " 他" : "") : "不明";

  // セルのHTMLを組み立てる
  tr.innerHTML = `
    <td class="cell-station-name">${guess.kanji}</td>
    <td class="${isWin ? 'cell-correct' : 'cell-distance'}">${isWin ? '🎯' : distance + ' km'}</td>
    <td class="${isWin ? 'cell-correct' : 'cell-direction'}">${isWin ? '🎯' : direction}</td>
    <td class="${regionStatus}">${guess.pref}<br><span style="font-size:10px;font-weight:normal;">${guess.municipality}</span></td>
    <td class="${compStatus}">${compText}</td>
    <td class="${lineStatus}">${lineText}</td>
  `;

  // 表の一番上（最新の結果として）に追加する
  tbody.insertBefore(tr, tbody.firstChild);
}

// ==========================================
// 初期化処理（ページを開いた時に実行）
// ==========================================
async function initLocaGame() {
  try {
    // 駅データを読み込む
    const res = await fetch('stations.json'); // 前作と同じJSONファイルを読み込みます
    const rawStations = await res.json();
    
    // 貨物駅を除外してデータプールにセット
    locaStations = rawStations.filter(s => !(s.companies && s.companies.length === 1 && s.companies[0] === "日本貨物鉄道"));
    
    // サジェスト機能を有効化
    setupSuggest();

    // 【仮】とりあえず今はランダムで正解駅を1つ決める（後で日付ベースのロジックに差し替えます）
    todayLocaStation = locaStations[Math.floor(Math.random() * locaStations.length)];
    console.log("【デバッグ用】今日の正解駅:", todayLocaStation.kanji); // F12ツールで答えを確認できます

    // 送信ボタンにイベントを紐付け
    document.getElementById("submit-guess-btn").addEventListener("click", submitLocaGuess);
    
    // サンプル行（HTMLにあったモック）を消去する
    document.getElementById("results-tbody").innerHTML = "";

  } catch (e) {
    console.error("データの読み込みに失敗しました:", e);
    alert("駅データの読み込みに失敗しました。");
  }
}

// 画面の準備ができたらゲームスタート
window.addEventListener("DOMContentLoaded", initLocaGame);
