// ==========================================
// 駅ロケ専用の共通変数とセーブデータ
// ==========================================
let currentDayIndex = 0;
let locaStats = JSON.parse(localStorage.getItem("ekiLocateStats") || '{"played":0,"won":0,"currentStreak":0,"maxStreak":0,"dist":[0,0,0,0,0,0,0,0,0,0,0]}');
let locaSavedState = JSON.parse(localStorage.getItem("ekiLocateState") || '{"date":-1,"guessesCount":0,"history":[],"difficulty":"normal","isOver":false}');

// エラー対策：HTMLから直接呼び出される関数は、必ず一番外側（グローバル）に配置します
function startGame(difficulty) {
  currentDifficulty = difficulty;
  locaGridHistory = [];
  locaGuessesCount = 0;
  
  // 開始時に設定を保存します
  saveLocaGameState();

  document.getElementById('difficulty-screen').style.display = 'none';
  document.getElementById('main-game-screen').style.display = 'block';
  updateRemainingGuesses();
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
      let score = 0; // スコアが高いほどリストの上に表示されます

      // ① 駅名の完全一致（最強スコア）
      if (s.kanji === query || s.yomi === query) {
        matchReason = `${s.pref}${s.municipality}`;
        score = 3;
      }
      // ② 駅名の部分一致
      else if (s.kanji.includes(query) || s.yomi.includes(query)) {
        matchReason = `${s.pref}${s.municipality}`;
        score = 2;
      }
      // ③ 住所・路線・事業者での一致
      else if ((s.pref + s.municipality + (s.ward || "")).includes(query)) {
        matchReason = `📍 ${s.pref}${s.municipality}`;
        score = 1;
      }
      else if (s.lines && s.lines.some(l => l.includes(query) || toHiragana(l).includes(query))) {
        const matchedLine = s.lines.find(l => l.includes(query) || toHiragana(l).includes(query));
        matchReason = `🚃 ${matchedLine}`;
        score = 1;
      }
      else if (s.companies && s.companies.some(c => c.includes(query) || toHiragana(c).includes(query))) {
        const matchedComp = s.companies.find(c => c.includes(query) || toHiragana(c).includes(query));
        matchReason = `🏢 ${matchedComp}`;
        score = 1;
      }

      // 何らかの条件にヒットした場合、結果リストに追加
      if (score > 0) {
        results.push({ station: s, reason: matchReason, score: score });
      }
    }

    // スコアの高い順に並び替え、動作を軽くするため最大50件でカット
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, 50);

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
  // 過去の回答の色の結果を、シェア用に記憶しておく
  // 過去の回答の色の結果を、シェアと復元用に記憶しておく
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

  locaGuessesCount++;
  updateRemainingGuesses(); // 残り回数の表示を減らす
  
  input.value = "";
  currentSelectedStation = null;
  document.getElementById("suggest-list").style.display = "none";

  // 勝敗のチェック（アラートの代わりに結果画面を呼び出す）
  if (isWin) {
    setTimeout(() => showLocaResultModal(true), 500);
  } else if (locaGuessesCount >= MAX_LOCA_GUESSES) {
    setTimeout(() => showLocaResultModal(false), 500);
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
// 各種ボタンとメニューの紐付け
// ==========================================
function setupUI() {
  // ヘルプ画面
  document.getElementById("help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "flex");
  document.getElementById("close-help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "none");
  
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
  let searchWard = todayLocaStation.ward || "";
  let muniMuni = safePref + searchMuni + searchWard;
  
  let isRural = todayLocaStation.muni_type === "町" || todayLocaStation.muni_type === "村" || (todayLocaStation.population && todayLocaStation.population < 30000);
  let areaKeyword = isRural ? safePref : muniMuni;

  let prText = `＼ この駅のある「${muniMuni}」へ聖地巡礼に行こう！ ／`;

  // トラベル用リンク
  let encodedStation = encodeURIComponent(encodeURIComponent(encodeURIComponent(areaKeyword)));
  let yahooUrl = `https://px.a8.net/svt/ejp?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2&a8ejpredirect=https%3A%2F%2Ftravel.yahoo.co.jp%2FikCo.ashx%3Fcosid%3Dy_a8net%26surl%3Dhttps%253A%252F%252Ftravel.yahoo.co.jp%252Fsearch%253Fadc%253D1%2526discsort%253D1%2526kwd%253D${encodedStation}%2526lc%253D1%2526ppc%253D2%2526rc%253D1%2526si%253D6`;
  let rakutenKeyword = encodeURIComponent(encodeURIComponent(areaKeyword));
  let rakutenUrl = `https://af.moshimo.com/af/c/click?a_id=5616621&p_id=55&pc_id=55&pl_id=624&url=https%3A%2F%2Fkw.travel.rakuten.co.jp%2Fkeyword%2FSearch.do%3Fcharset%3Dutf-8%26f_max%3D30%26l-id%3DtopC_search_keyword%26f_query%3D${rakutenKeyword}`;

  document.getElementById("affiliate-container").innerHTML = `
    <div style="background-color:#fff3e0; border:1px solid #ffcc80; border-radius:6px; padding:10px; font-size:11px;">
      <div style="font-weight:bold; color:#e65100; margin-bottom:8px;">${prText}</div>
      <div style="display:flex; justify-content:center; gap:8px;">
        <a href="${yahooUrl}" target="_blank" style="padding:8px 0; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; width:45%; font-weight:bold;">Y!トラベル</a>
        <a href="${rakutenUrl}" target="_blank" style="padding:8px 0; background-color:#00B900; color:#fff; text-decoration:none; border-radius:4px; width:45%; font-weight:bold;">楽天トラベル</a>
      </div>
    </div>
  `;

  // シェア用の絵文字グリッドを表示
  const colorToEmoji = {"cell-correct":"🟩", "cell-present":"🟨", "cell-absent":"⬛"};
  const gridHTML = locaGridHistory.map(row => {
    return `${row.distance} ${row.direction} ${colorToEmoji[row.region]}${colorToEmoji[row.comp]}${colorToEmoji[row.line]}`;
  }).join("<br>");
  document.getElementById("modal-grid").innerHTML = gridHTML;

  document.getElementById("result-modal").style.display = "flex";
}

// ==========================================
// シェア機能（専用のハッシュタグ設定）
// ==========================================
function shareLocaResult(type) {
  const colorToEmoji = {"cell-correct":"🟩", "cell-present":"🟨", "cell-absent":"⬛"};
  const isWin = locaGridHistory.length > 0 && locaGridHistory[locaGridHistory.length - 1].region === "cell-correct";
  const scoreStr = isWin ? `${locaGridHistory.length}/${MAX_LOCA_GUESSES}` : `X/${MAX_LOCA_GUESSES}`;
  const gameTitle = currentDifficulty === 'hard' ? "駅ロケHard" : "駅ロケ";
  const currentUrl = window.location.href.split('?')[0];

  let text = `${gameTitle} ${scoreStr}\n\n`;
  text += locaGridHistory.map((row, i) => {
    let r = `${row.distance} ${row.direction} ${colorToEmoji[row.region]}${colorToEmoji[row.comp]}${colorToEmoji[row.line]}`;
    return (isWin && i === locaGridHistory.length - 1) ? r + "💮" : r;
  }).join("\n");

  const hashtagStr = currentDifficulty === 'hard' ? `#駅ロケ\n#駅ロケHard\n` : `#駅ロケ\n`;
  text += `\n\n${hashtagStr}${currentUrl}`;

  if (type === "twitter") {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
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
// 毎日の正解駅を生成するロジック
// ==========================================
function selectTodayLocaStation() {
  // JST基準で現在の日付インデックス（2024年1月1日を0とする）を計算します
  const t = new Date();
  const jstMs = t.getTime() + (t.getTimezoneOffset() * 60000) + (9 * 3600000);
  const jstObj = new Date(jstMs);
  const todayUTC = Date.UTC(jstObj.getFullYear(), jstObj.getMonth(), jstObj.getDate());
  const baseUTC = Date.UTC(2024, 0, 1);
  currentDayIndex = Math.round((todayUTC - baseUTC) / 86400000);

  // 駅ドルと同じ条件で、出題可能な駅だけを絞り込みます（文字数制限は除外）
  const validStations = locaStations.filter(s => 
    s.pref !== "" && 
    s.address !== "" && 
    s.min_km !== null &&
    s.companies && s.companies.length > 0 &&
    !(s.companies.length === 1 && s.companies[0] === "日本貨物鉄道") &&
    (s.startDay === undefined || s.startDay <= currentDayIndex) && 
    (s.endDay === undefined || s.endDay > (currentDayIndex - 32) || s.endDay === 999999)
  );

  // 駅ロケ専用のシード値を使って、毎日異なる駅をランダムに1つ選びます
  let seed = currentDayIndex * 77777 + 12345;
  let hash = Math.imul(seed ^ (seed >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  hash = (hash ^ (hash >>> 16)) >>> 0;

  todayLocaStation = validStations[hash % validStations.length];
}


// ==========================================
// セーブデータの保存と復元、戦績集計
// ==========================================
function saveLocaGameState() {
  locaSavedState = {
    date: currentDayIndex,
    guessesCount: locaGuessesCount,
    history: locaGridHistory,
    difficulty: currentDifficulty,
    isOver: locaGuessesCount >= MAX_LOCA_GUESSES || (locaGridHistory.length > 0 && locaGridHistory[locaGridHistory.length - 1].region === "cell-correct")
  };
  localStorage.setItem("ekiLocateState", JSON.stringify(locaSavedState));
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
  // 日付が変わっている場合はセーブデータを初期化します
  if (locaSavedState.date !== currentDayIndex) {
    locaSavedState = {date: currentDayIndex, guessesCount: 0, history: [], difficulty: "normal", isOver: false};
    localStorage.setItem("ekiLocateState", JSON.stringify(locaSavedState));
    return;
  }

  // 過去のプレイ履歴がある場合は画面を復元します
  if (locaSavedState.guessesCount > 0) {
    currentDifficulty = locaSavedState.difficulty;
    locaGuessesCount = locaSavedState.guessesCount;
    locaGridHistory = locaSavedState.history;
    
    // 難易度選択画面を飛ばしてメイン画面を出します
    document.getElementById('difficulty-screen').style.display = 'none';
    document.getElementById('main-game-screen').style.display = 'block';
    updateRemainingGuesses();

    // テーブルの行を復元します（履歴の中身を描画）
    locaGridHistory.forEach(h => {
      renderResultRow(h.guess, h.distanceNum, h.direction, h.region, h.comp, h.line, h.isWin);
    });

    if (locaSavedState.isOver) {
      document.getElementById("submit-guess-btn").disabled = true;
      document.getElementById("station-search-input").disabled = true;
    }
  }
}


// ==========================================
// 初期化処理（ページを開いた時に実行）
// ==========================================
async function initLocaGame() {
  try {
    // 駅データを読み込む
    const res = await fetch('../stations.json'); // 前作と同じJSONファイルを読み込みます
    const rawStations = await res.json();
    
    // 貨物駅を除外してデータプールにセット
    locaStations = rawStations.filter(s => !(s.companies && s.companies.length === 1 && s.companies[0] === "日本貨物鉄道"));
    
    // サジェスト機能を有効化
    setupSuggest();

    // 正解駅の生成と状態の復元
    selectTodayLocaStation();
    restoreLocaGameState();

    // UIボタンの有効化とイベント判定の呼び出しを追加
    setupUI();
    checkLocaEvent();

    // 【仮】とりあえず今はランダムで正解駅を1つ決める（後で日付ベースのロジックに差し替えます）
    //todayLocaStation = locaStations[Math.floor(Math.random() * locaStations.length)];
    //console.log("【デバッグ用】今日の正解駅:", todayLocaStation.kanji); // F12ツールで答えを確認できます

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
