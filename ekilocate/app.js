// ==========================================
// 駅ロケ専用の共通変数とセーブデータ
// ==========================================
let currentDayIndex = 0; // 今日が基準日から何日目かを全関数で共有する箱
let todayLocaStationNormal = null; // 通常モード用の正解駅
let todayLocaStationHard = null;   // ハードモード用の正解駅

let locaStats = JSON.parse(localStorage.getItem("ekiLocateStats") || '{"played":0,"won":0,"currentStreak":0,"maxStreak":0,"dist":[0,0,0,0,0,0,0,0,0,0,0]}');
//セーブデータを難易度ごとに分ける
let locaSavedState = JSON.parse(localStorage.getItem("ekiLocateStateV2") || '{"date":-1, "normal": {"guessesCount":0, "history":[], "isOver":false}, "hard": {"guessesCount":0, "history":[], "isOver":false}}');


// ==========================================
// ゲーム開始と再開の処理
// ==========================================
function startGame(difficulty) {
  currentDifficulty = difficulty;
  
  // 選ばれた難易度に応じて、今日の正解駅をセットします
  todayLocaStation = currentDifficulty === 'hard' ? todayLocaStationHard : todayLocaStationNormal;

  // 該当する難易度のセーブデータを読み込みます
  const state = locaSavedState[currentDifficulty];
  locaGridHistory = state.history || [];
  locaGuessesCount = state.guessesCount || 0;
  
  // 画面をゲーム画面に切り替え、戻るボタンを表示します
  document.getElementById('difficulty-screen').style.display = 'none';
  document.getElementById('main-game-screen').style.display = 'block';
  document.getElementById('back-to-diff-btn').style.display = 'block';
  
  updateRemainingGuesses();

  // 画面に残っている古い表をまっさらにしてから、履歴を描画し直して完全に復元します
  document.getElementById("results-tbody").innerHTML = "";
  locaGridHistory.forEach(h => {
    renderResultRow(h.guess, h.distanceNum, h.direction, h.region, h.comp, h.line, h.isWin);
  });

  // すでにゲームが終わっている場合は、ボタン等の入力を無効化します
  if (state.isOver) {
    document.getElementById("submit-guess-btn").disabled = true;
    document.getElementById("station-search-input").disabled = true;
  } else {
    document.getElementById("submit-guess-btn").disabled = false;
    document.getElementById("station-search-input").disabled = false;
  }
}


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

    
    // 絞り込み処理（スコア制で駅名の一致を最優先にする）
    let results = [];
    for (let i = 0; i < locaStations.length; i++) {
      const s = locaStations[i];
      let matchReason = "";
      let score = 0;

      // 1. 完全一致（漢字・読み）を最優先
      if (s.kanji === query || s.yomi === query) {
        matchReason = `${s.pref}${s.municipality}`;
        score = 1000;
      } 
      // 2. 頭文字からの前方一致（短い駅名ほどスコアを高くして上に出す）
      else if (s.kanji.startsWith(query) || s.yomi.startsWith(query)) {
        matchReason = `${s.pref}${s.municipality}`;
        score = 500 - s.kanji.length;
      } 
      // 3. 文字の部分一致
      else if (s.kanji.includes(query) || s.yomi.includes(query)) {
        matchReason = `${s.pref}${s.municipality}`;
        score = 100 - s.kanji.length;
      } 
      // 4. 地域、路線、事業者
      else if ((s.pref + s.municipality + (s.ward || "")).includes(query)) {
        matchReason = `📍 ${s.pref}${s.municipality}`;
        score = 50;
      } else if (s.lines && s.lines.some(l => l.includes(query) || toHiragana(l).includes(query))) {
        const matchedLine = s.lines.find(l => l.includes(query) || toHiragana(l).includes(query));
        matchReason = `🚃 ${matchedLine}`;
        score = 30;
      } else if (s.companies && s.companies.some(c => c.includes(query) || toHiragana(c).includes(query))) {
        const matchedComp = s.companies.find(c => c.includes(query) || toHiragana(c).includes(query));
        matchReason = `🏢 ${matchedComp}`;
        score = 10;
      }

      if (score > 0) {
        results.push({ station: s, reason: matchReason, score: score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, 50);

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
let currentDifficulty = 'normal';  // 今回のプレイの難易度を記憶しておく変数（初期値は通常）
let locaGridHistory = []; // シェア用の結果絵文字を保存する箱を追加


// ==========================================
// 難易度選択とゲーム開始のロジック
// ==========================================

// 画面の「残り回答可能数」のテキストを更新する関数
function updateRemainingGuesses() {
  const remain = MAX_LOCA_GUESSES - locaGuessesCount;
  const display = document.getElementById("remaining-guesses-display");
  if (display) display.textContent = `残り回答可能数：${remain} 回`;
}

// 難易度ボタンが押された時に実行される関数
function startGame(difficulty) {
  currentDifficulty = difficulty;
  locaGridHistory = []; // 履歴をリセット
  
  document.getElementById('difficulty-screen').style.display = 'none';
  document.getElementById('main-game-screen').style.display = 'block';
  
  updateRemainingGuesses(); // 開始時に残り回数を表示
}


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

  // 【安全装置】万が一正解駅がセットされていない場合は、ここで強制的にセットします
  if (!todayLocaStation) {
    todayLocaStation = currentDifficulty === 'hard' ? todayLocaStationHard : todayLocaStationNormal;
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
  
  // 入力欄をリセット
  // 過去の回答の色の結果と、駅の全データを復元・シェア用に記憶しておく
  locaGridHistory.push({
    guess: guess,
    distance: isWin ? "🎯" : distance + "km",
    distanceNum: distance,
    direction: isWin ? "🎯" : direction,
    region: regionStatus,
    comp: compStatus,
    line: lineStatus,
    isWin: isWin
  });

  // ここでカウントを増やすのは「1回だけ」にします
  locaGuessesCount++;
  updateRemainingGuesses();
  
  input.value = "";
  currentSelectedStation = null;
  document.getElementById("suggest-list").style.display = "none";

  // 勝敗のチェックとセーブデータの保存
  if (isWin) {
    saveLocaStats(true);
    saveLocaGameState();
    document.getElementById("submit-guess-btn").disabled = true; // ボタン無効化
    setTimeout(() => showLocaResultModal(true), 500);
  } else if (locaGuessesCount >= MAX_LOCA_GUESSES) {
    saveLocaStats(false);
    saveLocaGameState();
    document.getElementById("submit-guess-btn").disabled = true; // ボタン無効化
    setTimeout(() => showLocaResultModal(false), 500);
  } else {
    // 途中経過も保存する
    saveLocaGameState();
  }
}

// 結果をテーブルの1行（<tr>）として組み立てて画面に出す関数
function renderResultRow(guess, distance, direction, regionStatus, compStatus, lineStatus, isWin) {
  const tbody = document.getElementById("results-tbody");
  const tr = document.createElement("tr");

  // 事業者と路線の表示テキストを作ります（長すぎる場合は「〇〇 他」と省略）
  // 後の処理で書き換える可能性があるため、constではなくletで宣言します
  let compText = (guess.companies && guess.companies.length > 0) ? guess.companies[0] + (guess.companies.length > 1 ? " 他" : "") : "不明";
  let lineText = (guess.lines && guess.lines.length > 0) ? guess.lines[0] + (guess.lines.length > 1 ? " 他" : "") : "不明";

  // もし難易度が「ハード」で、かつ完全正解（isWin）ではない場合のみ発動する処理
  if (currentDifficulty === 'hard' && !isWin) {

    // テキストを「???」で上書きして見えなくします
    compText = "???";
    lineText = "???";

    // セルの色もヒントになってしまうため、強制的にグレー（不一致扱い）にします
    compStatus = "cell-absent";
    lineStatus = "cell-absent";

  }

  // セルのHTMLを組み立てる
  tr.innerHTML = `
    <td class="cell-station-name">${guess.kanji}</td>
    <td class="${isWin ? 'cell-correct' : 'cell-distance'}">
      <span style="display:inline-block; width:55px; text-align:left;">${isWin ? '🎯' : distance + ' km'}</span>
    </td>
    <td class="${isWin ? 'cell-correct' : 'cell-direction'}">${isWin ? '🎯' : direction}</td>
    <td class="${regionStatus}">${guess.pref}<br><span style="font-size:10px;font-weight:normal;">${guess.municipality}</span></td>
    <td class="${compStatus}">${compText}</td>
    <td class="${lineStatus}">${lineText}</td>
  `;

  // 表の一番上（最新の結果として）に追加する
  tbody.insertBefore(tr, tbody.firstChild);
}


// ==========================================
// 各種ボタンとメニューの紐付け
// ==========================================
function setupUI() {
  // ヘルプ画面
  document.getElementById("help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "flex");
  document.getElementById("close-help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "none");

  // 戻るボタンの機能
  document.getElementById("back-to-diff-btn").addEventListener("click", () => {
    document.getElementById("main-game-screen").style.display = "none";
    document.getElementById("difficulty-screen").style.display = "block";
    document.getElementById("back-to-diff-btn").style.display = "none";
  });

  // グラフ（戦績）ボタンの機能
  document.getElementById("stats-btn").addEventListener("click", () => {
    if (locaSavedState && locaSavedState.isOver) {
      const isWin = locaSavedState.history.length > 0 && locaSavedState.history[locaSavedState.history.length - 1].isWin;
      showLocaResultModal(isWin);
    } else {
      alert("ゲームクリア後に見ることができます");
    }
  });
  
  // サイドメニュー
  const closeSideMenu = () => {
    document.getElementById("side-menu").style.right = "-250px";
    setTimeout(() => document.getElementById("side-menu-overlay").style.display = "none", 300);
  };
  document.getElementById("menu-btn").addEventListener("click", () => {
    document.getElementById("side-menu-overlay").style.display = "block";
    setTimeout(() => document.getElementById("side-menu").style.right = "0", 10);
  });
  document.getElementById("close-menu-btn").addEventListener("click", closeSideMenu);
  document.getElementById("side-menu-overlay").addEventListener("click", closeSideMenu);

  // テーマ切り替え
  const themes = ["", "theme-dark", "theme-sakura", "theme-ocean", "theme-green", "theme-blue"];
  let themeIdx = 0;
  document.getElementById("theme-btn").addEventListener("click", () => {
    if (themes[themeIdx] !== "") document.body.classList.remove(themes[themeIdx]);
    themeIdx = (themeIdx + 1) % themes.length;
    if (themes[themeIdx] !== "") document.body.classList.add(themes[themeIdx]);
  });

  // 結果画面の閉じるボタン
  document.getElementById("close-modal-btn").addEventListener("click", () => document.getElementById("result-modal").style.display = "none");
  
  // シェアボタン
  document.getElementById("share-btn").addEventListener("click", () => shareLocaResult("twitter"));
  document.getElementById("line-btn").addEventListener("click", () => shareLocaResult("line"));
  document.getElementById("fb-btn").addEventListener("click", () => shareLocaResult("facebook"));
  document.getElementById("copy-btn").addEventListener("click", () => shareLocaResult("copy"));
}

// ==========================================
// 結果画面とアフィリエイトリンクの生成
// ==========================================
function showLocaResultModal(isWin) {
  document.getElementById("modal-title").textContent = isWin ? "正解！おめでとう！" : "ゲームオーバー";
  document.getElementById("modal-desc").textContent = `${todayLocaStation.kanji} (${todayLocaStation.pref}${todayLocaStation.municipality})`;

  // 駅ドルと同じロジックでアフィリエイトの地域キーワードを作成
  let safePref = todayLocaStation.pref || "東京都";
  let searchMuni = todayLocaStation.municipality || "";
  let muniMuni = safePref + searchMuni;
  
  let isRural = todayLocaStation.muni_type === "町" || todayLocaStation.muni_type === "村" || (todayLocaStation.population && todayLocaStation.population < 30000);
  let areaKeyword = isRural ? safePref : muniMuni;

  let prText = `＼ この駅のある「${muniMuni}」へ聖地巡礼に行こう！ ／`;

  let encodedStation = encodeURIComponent(encodeURIComponent(encodeURIComponent(areaKeyword)));
  let yahooUrl = `https://px.a8.net/svt/ejp?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2&a8ejpredirect=https%3A%2F%2Ftravel.yahoo.co.jp%2FikCo.ashx%3Fcosid%3Dy_a8net%26surl%3Dhttps%253A%252F%252Ftravel.yahoo.co.jp%252Fsearch%253Fadc%253D1%2526discsort%253D1%2526kwd%253D${encodedStation}%2526lc%253D1%2526ppc%253D2%2526rc%253D1%2526si%253D6`;
  let rakutenKeyword = encodeURIComponent(encodeURIComponent(areaKeyword));
  let rakutenUrl = `https://af.moshimo.com/af/c/click?a_id=5616621&p_id=55&pc_id=55&pl_id=624&url=https%3A%2F%2Fkw.travel.rakuten.co.jp%2Fkeyword%2FSearch.do%3Fcharset%3Dutf-8%26f_max%3D30%26l-id%3DtopC_search_keyword%26f_query%3D${rakutenKeyword}`;
  
  let yahooShoppingDest = `https://shopping.yahoo.co.jp/search/${encodeURIComponent(muniMuni)}+${encodeURIComponent("特産品")}/0/?area=13&first=1&ss_first=1&sretry=0&tab_ex=commerce`;
  let yahooShoppingUrl = `https://af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=${encodeURIComponent(yahooShoppingDest)}`;
  let rakutenMarketDest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(muniMuni)}+${encodeURIComponent("特産品")}/`;
  let rakutenMarketUrl = `https://af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=${encodeURIComponent(rakutenMarketDest)}`;
  
  let yahooFurusatoDest = `https://shopping.yahoo.co.jp/search/${encodeURIComponent(muniMuni)}+${encodeURIComponent("ふるさと納税")}/0/?first=1&ss_first=1&sretry=0&tab_ex=commerce`;
  let yahooFurusatoUrl = `https://af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=${encodeURIComponent(yahooFurusatoDest)}`;
  let rakutenFurusatoDest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(muniMuni)}+${encodeURIComponent("ふるさと納税")}/`;
  let rakutenFurusatoUrl = `https://af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=${encodeURIComponent(rakutenFurusatoDest)}`;

  document.getElementById("affiliate-container").innerHTML = `
    <div style="background-color:#fff3e0; border:1px solid #ffcc80; border-radius:6px; padding:10px; margin-bottom:5px;">
      <div style="font-size:11px; font-weight:bold; color:#e65100; margin-bottom:8px;">${prText}</div>
      <div style="display:flex; justify-content:center; gap:8px; align-items:center; flex-wrap:wrap;">
        <a href="${yahooUrl}" target="_blank" style="padding:8px 0; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">Y!トラベル</a>
        <a href="${rakutenUrl}" target="_blank" style="padding:8px 0; background-color:#00B900; color:#fff; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">楽天トラベル</a>
        <div style="width:100%; border-top:1px dashed #ffcc80; margin:6px 0;"></div>
        <div style="width:100%; font-size:11px; font-weight:bold; color:#e65100; margin-bottom:4px; text-align:left; padding-left:5%;">🎁 名産品をお取り寄せ</div>
        <a href="${yahooShoppingUrl}" target="_blank" style="padding:8px 0; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">Y!ショッピング</a>
        <a href="${rakutenMarketUrl}" target="_blank" style="padding:8px 0; background-color:#bf0000; color:#fff; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">楽天市場</a>
        <div style="width:100%; border-top:1px dashed #ffcc80; margin:6px 0;"></div>
        <div style="width:100%; font-size:11px; font-weight:bold; color:#e65100; margin-bottom:4px; text-align:left; padding-left:5%;">🗾 ふるさと納税</div>
        <a href="${yahooFurusatoUrl}" target="_blank" style="padding:8px 0; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">Y!ふるさと納税</a>
        <a href="${rakutenFurusatoUrl}" target="_blank" style="padding:8px 0; background-color:#7a0000; color:#fff; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">楽天ふるさと納税</a>
      </div>
    </div>
  `;

  // シェア用の絵文字グリッドを表示
  // シェア時と同じ絵文字の順番（地域→事業者→路線→方角→距離）でグリッドを表示します
  const colorToEmoji = {"cell-correct":"🟩", "cell-present":"🟨", "cell-absent":"⬛"};
  const gridHTML = locaGridHistory.map(row => {
    return `${colorToEmoji[row.region]}${colorToEmoji[row.comp]}${colorToEmoji[row.line]} ${row.direction} ${row.distance}`;
  }).join("<br>");
  document.getElementById("modal-grid").innerHTML = gridHTML;

  document.getElementById("result-modal").style.display = "flex";
}

// ==========================================
// シェア機能（専用のハッシュタグ設定）
// ==========================================
function shareLocaResult(type) {
  const colorToEmoji = {"cell-correct":"🟩", "cell-present":"🟨", "cell-absent":"⬛"};
  const isWin = locaGridHistory.length > 0 && locaGridHistory[locaGridHistory.length - 1].isWin;
  const scoreStr = isWin ? `${locaGridHistory.length}/${MAX_LOCA_GUESSES}` : `X/${MAX_LOCA_GUESSES}`;
  const gameTitle = currentDifficulty === 'hard' ? "駅ロケHard" : "駅ロケ";
  const currentUrl = window.location.href.split('?')[0];

  let text = `${gameTitle} ${scoreStr}\n\n`;
  text += locaGridHistory.map((row, i) => {
    // 指定の順番（地域→事業者→路線→方角→距離）でテキスト化します
    return `${colorToEmoji[row.region]}${colorToEmoji[row.comp]}${colorToEmoji[row.line]}${row.direction}${row.distance}`;
  }).join("\n");

  const hashtagStr = currentDifficulty === 'hard' ? `#駅ロケ\n#駅ロケHard\n` : `#駅ロケ\n`;
  text += `\n\n${hashtagStr}${currentUrl}`;

  if (type === "twitter") {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  } else if (type === "line") {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
  } else if (type === "facebook") {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, "_blank");
  } else if (type === "copy") {
    navigator.clipboard.writeText(text).then(() => alert("クリップボードにコピーしました"));
  }
}

// ==========================================
// 行事日エフェクト（背景色とタイルの文字変更）
// ==========================================
function triggerLocaEvent(ev) {
  document.body.className = document.body.className.replace(/event-\w+/g, "");
  if (!ev) return;
  document.body.classList.add("event-" + ev);

  const titleEl = document.getElementById("game-title");
  const iconHtml = '<img src="/ekilocate-icon.svg" alt="駅ロケアイコン" style="width:36px; height:36px; margin-right:10px; border-radius:8px;">';
  
  if (ev === "newyear") titleEl.innerHTML = iconHtml + "駅ロケ 🎍 謹賀新年！";
  else if (ev === "valentine") titleEl.innerHTML = iconHtml + "駅ロケ 🍫 ハッピーバレンタイン！";
  else if (ev === "hinamatsuri") titleEl.innerHTML = iconHtml + "駅ロケ 🌸 楽しいひなまつり！";
  else if (ev === "kodomo") titleEl.innerHTML = iconHtml + "駅ロケ 🎏 こどもの日！";
  else if (ev === "tanabata") titleEl.innerHTML = iconHtml + "駅ロケ 🎋 七夕まつり！";
  else if (ev === "halloween") titleEl.innerHTML = iconHtml + "駅ロケ 🎃 ハッピーハロウィン！";
  else if (ev === "christmas") titleEl.innerHTML = iconHtml + "駅ロケ 🎄 メリークリスマス！";
  else if (ev === "nye") titleEl.innerHTML = iconHtml + "駅ロケ 🔔 良いお年を！";
}

function checkLocaEvent() {
  const d = new Date(); const m = d.getMonth() + 1; const day = d.getDate();
  let ev = "";
  if (m === 1 && day <= 3) ev = "newyear";
  else if (m === 2 && day === 14) ev = "valentine";
  else if (m === 3 && day === 3) ev = "hinamatsuri";
  else if (m === 5 && day === 5) ev = "kodomo";
  else if (m === 7 && day === 7) ev = "tanabata";
  else if (m === 10 && day === 31) ev = "halloween";
  else if (m === 12 && (day === 24 || day === 25)) ev = "christmas";
  else if (m === 12 && day === 31) ev = "nye";
  triggerLocaEvent(ev);
}


// ==========================================
// 毎日の正解駅を生成するロジック（サーバー通信＆超高速キャッシュ付き）
// ==========================================
async function selectTodayLocaStation() {
  const SECRET_SALT = "EkiLocate_Secret_2026!";

  // 1. JSONファイルを読みに行くための日付文字列を作成します（必須）
  const t = new Date();
  const jstMs = t.getTime() + (t.getTimezoneOffset() * 60000) + (9 * 3600000);
  const jstObj = new Date(jstMs);
  const yearStr = jstObj.getFullYear();
  const todayStr = jstObj.getFullYear() + "-" + String(jstObj.getMonth() + 1).padStart(2, '0') + "-" + String(jstObj.getDate()).padStart(2, '0');

  // 2. キャッシュの確認（ブラウザに今日の答えが記憶されているかチェック）
  const cacheStr = localStorage.getItem("ekiLocateAnswerCache");
  if (cacheStr) {
    const cache = JSON.parse(cacheStr);
    if (cache.date === currentDayIndex) {
      todayLocaStationNormal = cache.normal;
      todayLocaStationHard = cache.hard;
      return; 
    }
  }

  // 正解候補となる駅を大まかに絞り込みます（貨物駅は除外）
  const validStations = locaStations.filter(s => 
    s.pref !== "" && 
    s.address !== "" && 
    s.min_km !== null &&
    s.companies && s.companies.length > 0 &&
    !(s.companies.length === 1 && s.companies[0] === "日本貨物鉄道") 
  );

  if (validStations.length === 0) return;

  // 3. メインルート：answersフォルダからのJSON取得と逆引き
  try {
    const res = await fetch(`answers/${yearStr}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("答えファイルの取得に失敗しました");
    const answersData = await res.json();

    const targetHashNormal = answersData[todayStr]?.normal;
    const targetHashHard = answersData[todayStr]?.hard;

    if (!targetHashNormal || !targetHashHard) throw new Error("本日の答えデータがファイル内にありません");

    const calcSha256 = async (str) => {
      const buf = new TextEncoder().encode(str);
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const hashPromises = validStations.map(async (s) => {
      const sHash = await calcSha256(SECRET_SALT + s.kanji);
      return { station: s, hash: sHash };
    });

    const hashedStations = await Promise.all(hashPromises);
    const foundNormal = hashedStations.find(item => item.hash === targetHashNormal);
    const foundHard = hashedStations.find(item => item.hash === targetHashHard);

    if (foundNormal && foundHard) {
      todayLocaStationNormal = foundNormal.station;
      todayLocaStationHard = foundHard.station;
    } else {
      throw new Error("ハッシュが一致する駅が見つかりません");
    }

  // 4. フォールバックルート：通信エラー時はJS側で超高速シミュレーション計算
  } catch (err) {
    console.warn("⚠️ サーバーの答えファイル読み込み失敗。自力でシミュレーション計算します:", err);

    // 動作を最速にするための事前準備（ループの外でキーを作っておく）
    for (let i = 0; i < validStations.length; i++) {
       validStations[i]._cKey = (validStations[i].latitude && validStations[i].longitude) 
                                 ? `${validStations[i].latitude},${validStations[i].longitude}` 
                                 : validStations[i].url;
    }

    let lookback = 1000;
    let nextAvailableDay = new Map(); // 配列ではなくMapを使うことで超高速化
    let targetNormal = null;
    let targetHard = null;

    // Day 0から今日まで歴史をシミュレーションします（無駄な配列作成を排除し、一瞬で終わる構造に改善）
    for (let d = 0; d <= currentDayIndex; d++) {
      let poolNormal = [];
      let poolHard = [];
      
      for (let i = 0; i < validStations.length; i++) {
         let s = validStations[i];
         if (s.startDay !== undefined && s.startDay > d) continue;
         if (s.endDay !== undefined && s.endDay <= d && s.endDay !== 999999) continue;
         if ((nextAvailableDay.get(s._cKey) || 0) > d) continue;
         poolNormal.push(s);
         poolHard.push(s);
      }
      if (poolNormal.length === 0) {
         poolNormal = validStations;
         poolHard = validStations;
      }

      // 通常モードの抽選
      let seedN = d * 33333 + 54321;
      let hashN = Math.imul(seedN ^ (seedN >>> 15), 2246822507);
      hashN = Math.imul(hashN ^ (hashN >>> 13), 3266489909);
      hashN = (hashN ^ (hashN >>> 16)) >>> 0;
      let candidateNormal = poolNormal[hashN % poolNormal.length];
      nextAvailableDay.set(candidateNormal._cKey, d + lookback + 1);

      // ハードモードの抽選
      poolHard = poolHard.filter(s => s._cKey !== candidateNormal._cKey);
      if (poolHard.length === 0) poolHard = validStations;

      let seedH = d * 33333 + 99999;
      let hashH = Math.imul(seedH ^ (seedH >>> 15), 2246822507);
      hashH = Math.imul(hashH ^ (hashH >>> 13), 3266489909);
      hashH = (hashH ^ (hashH >>> 16)) >>> 0;
      let candidateHard = poolHard[hashH % poolHard.length];
      nextAvailableDay.set(candidateHard._cKey, d + lookback + 1);

      if (d === currentDayIndex) {
        targetNormal = candidateNormal;
        targetHard = candidateHard;
      }
    }
    todayLocaStationNormal = targetNormal;
    todayLocaStationHard = targetHard;
  }

  // 計算結果をキャッシュに保存して次回以降の読み込みを0秒にします
  localStorage.setItem("ekiLocateAnswerCache", JSON.stringify({
    date: currentDayIndex,
    normal: todayLocaStationNormal,
    hard: todayLocaStationHard
  }));
}


// ==========================================
// セーブデータの保存と復元
// ==========================================
function saveLocaGameState() {
  // 現在遊んでいる難易度のデータを保存
  locaSavedState[currentDifficulty] = {
    guessesCount: locaGuessesCount,
    history: locaGridHistory,
    isOver: locaGuessesCount >= MAX_LOCA_GUESSES || (locaGridHistory.length > 0 && locaGridHistory[locaGridHistory.length - 1].isWin)
  };
  locaSavedState.date = currentDayIndex;
  locaSavedState.lastPlayed = currentDifficulty; // 最後に遊んだモードを記憶します
  localStorage.setItem("ekiLocateStateV2", JSON.stringify(locaSavedState));
}

function saveLocaStats(isWin) {
  locaStats.played++;
  if (isWin) {
    locaStats.won++;
    locaStats.currentStreak++;
    if (locaStats.currentStreak > locaStats.maxStreak) locaStats.maxStreak = locaStats.currentStreak;
    locaStats.dist[locaGuessesCount] = (locaStats.dist[locaGuessesCount] || 0) + 1;
  } else {
    locaStats.currentStreak = 0;
  }
  localStorage.setItem("ekiLocateStats", JSON.stringify(locaStats));
}

function restoreLocaGameState() {
  // 日付が変わっている場合は、セーブデータをリセットして新しい日の枠を作ります
  if (locaSavedState.date !== currentDayIndex) {
    locaSavedState = {
      date: currentDayIndex, 
      normal: {guessesCount: 0, history: [], isOver: false}, 
      hard: {guessesCount: 0, history: [], isOver: false}
      lastPlayed: null
    };
    localStorage.setItem("ekiLocateStateV2", JSON.stringify(locaSavedState));
  }
  // 最後に遊んでいたモードの履歴があれば、選択画面を飛ばして直接ゲーム画面を復元します
  const last = locaSavedState.lastPlayed;
  if (last && locaSavedState[last].guessesCount > 0) {
     startGame(last);
  } else {
     // まだ1回も遊んでいない場合は、通常通り難易度選択画面を出します
     document.getElementById('difficulty-screen').style.display = 'block';
     document.getElementById('main-game-screen').style.display = 'none';
     document.getElementById('back-to-diff-btn').style.display = 'none';
  }
}


// ==========================================
// 初期化処理（ページを開いた時に実行）
// ==========================================
async function initLocaGame() {
  try {
    // 1. 日本時間（JST）ベースの日付インデックスを計算します
    const t = new Date();
    const jstMs = t.getTime() + (t.getTimezoneOffset() * 60000) + (9 * 3600000);
    const jstObj = new Date(jstMs);
    const todayUTC = Date.UTC(jstObj.getFullYear(), jstObj.getMonth(), jstObj.getDate());
    const baseUTC = Date.UTC(2024, 0, 1);
    currentDayIndex = Math.round((todayUTC - baseUTC) / 86400000);

    // 2. 駅データの読み込み（Cache APIによる大容量バックアップ機能付き）
    let rawStations = [];
    try {
      // 常に最新を取りに行く（ルートフォルダを指定します）
      const res = await fetch('/stations.json', { cache: "no-store" });
      if (!res.ok) throw new Error("ネットワークエラー");

      // エラーページ（HTML）などを誤って読み込んでいないか、一度テキストとして確認します
      const textData = await res.text();
      if (textData.trim().startsWith("<")) {
        throw new Error("/stations.json の代わりに HTML が読み込まれました。");
      }

      // 問題がなければデータ（JSON）として変換します
      rawStations = JSON.parse(textData);

      // Cache APIを使って、ブラウザの専用金庫に非同期で安全に保存します（13MBでもフリーズしません）
      if ('caches' in window) {
        const cache = await caches.open('ekilocate-backup-v1');
        // 一度 textData として読み取ってしまったため、キャッシュ保存用に新しい Response オブジェクトを作り直して金庫に入れます
        const resToCache = new Response(textData, {
          headers: { 'Content-Type': 'application/json' }
        });
        cache.put('../stations.json', resToCache).catch(e => console.warn("キャッシュ保存スキップ:", e));
      }
    } catch (err) {
      console.warn("最新データの取得に失敗。Cache APIのバックアップを使用します。", err);

      let isRecovered = false;
      // 通信エラー時は、Cache APIの金庫から過去のデータを引っ張り出します
      if ('caches' in window) {
        const cache = await caches.open('ekilocate-backup-v1');
        const cachedRes = await cache.match('../stations.json');
        if (cachedRes) {
          rawStations = await cachedRes.json();
          isRecovered = true;

          // 画面上部に「バックアップ起動中」の警告バナーを動的に表示します
          if (!document.getElementById("offline-warning-banner")) {
            document.body.insertAdjacentHTML("afterbegin", `
              <div id="offline-warning-banner" style="background-color: #fff3e0; color: #e65100; font-size: 11px; font-weight: bold; text-align: center; padding: 6px; border-bottom: 1px solid #ffcc80; width: 100%; box-sizing: border-box;">
                ⚠️ バックアップデータで運行中。最新の駅情報と異なる場合があります。
              </div>
            `);
          }
        }
      }

      // バックアップすら無い（完全な初回プレイで通信エラー）場合の致命的エラー画面です
      if (!isRecovered) {
        document.body.innerHTML = `
          <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h3 style="color:#e53935;">駅データの読み込みに失敗しました</h3>
            <p style="font-size:14px; color:#555;">通信環境の良いところで、もう一度お試しください。</p>
            <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; font-size:16px; font-weight:bold; background:#3498db; color:#fff; border:none; border-radius:5px;">再読み込み</button>
          </div>`;
        return; // ゲームの起動処理を完全に止めます
      }
    }

    // 計算済みの currentDayIndex を使って、未来の駅や古い廃止駅を省きます
    locaStations = rawStations.filter(s => {
      const isFreight = s.companies && s.companies.length === 1 && s.companies[0] === "日本貨物鉄道";
      const isFuture = s.startDay !== undefined && s.startDay > currentDayIndex;
      const isAbolishedOld = s.endDay !== undefined && s.endDay !== 999999 && s.endDay <= currentDayIndex - 33;
      return !isFreight && !isFuture && !isAbolishedOld;
    });

    // サジェスト機能を有効化します
    setupSuggest();

    // 正解駅の計算・通信が終わるのをしっかり「待つ（await）」ようにします
    await selectTodayLocaStation();

    restoreLocaGameState();

    // UIボタンの有効化とイベント判定の呼び出し
    setupUI();
    checkLocaEvent();

    // 「送信ボタン」と「Enterキー」のスイッチを有効化します
    const submitBtn = document.getElementById("submit-guess-btn");
    const searchInput = document.getElementById("station-search-input");
    if (submitBtn) submitBtn.addEventListener("click", submitLocaGuess);
    if (searchInput) {
      searchInput.addEventListener("keypress", function(e) {
        if (e.key === "Enter") submitLocaGuess();
      });
    }

  } catch (e) {
    console.error("予期せぬエラーが発生しました:", e);
    alert("ゲームの起動に失敗しました。");
  }
}

// 画面の準備ができたらゲームスタート
window.addEventListener("DOMContentLoaded", initLocaGame);
