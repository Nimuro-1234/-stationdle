// ==========================================
// 駅ロケ専用の共通変数とセーブデータ
// ==========================================
let currentDayIndex = 0; // 今日が基準日から何日目かを全関数で共有する箱
let todayLocaStationNormal = null; // 通常モード用の正解駅
let todayLocaStationHard = null;   // ハードモード用の正解駅

// モード別の戦績データ（手数、勝率、連勝記録、クリアした日付など）
let locaStats = JSON.parse(localStorage.getItem("ekiLocateStatsV2") || JSON.stringify({
  normal: { played:0, won:0, currentStreak:0, maxStreak:0, dist:[0,0,0,0,0,0,0,0,0,0,0], clearedDates:[] },
  hard:   { played:0, won:0, currentStreak:0, maxStreak:0, dist:[0,0,0,0,0,0,0,0,0,0,0], clearedDates:[] }
}));

// モード共通のメタデータ（ログイン日数、連続クリア、駅図鑑など）
let locaMeta = JSON.parse(localStorage.getItem("ekiLocateMeta") || JSON.stringify({
  firstLoginDate: "", lastLoginDate: "", consecutiveLoginDays: 0, 
  consecutiveClearDays: 0, lastClearDate: "", unlockedStations: []
}));

// ユーザー設定データ（テーマカラーや音量など）
let locaSettings = JSON.parse(localStorage.getItem("ekiLocateSettings") || JSON.stringify({
  theme: "", volume: 50, fontsize: "normal",
}));

//プレイ途中データ
let locaSavedState = JSON.parse(localStorage.getItem("ekiLocateStateV2") || '{"date":-1, "normal": {"guessesCount":0, "history":[], "isOver":false}, "hard": {"guessesCount":0, "history":[], "isOver":false}}');


// ==========================================
// ゲーム開始と再開の処理
// ==========================================


// プログレスバーを滑らかに進めるための変数と関数
let currentLoadingProgress = 0;
function updateLocaLoadingProgress(targetPercent, text) {
  const bar = document.getElementById("circular-progress-bar");
  const textEl = document.getElementById("loading-text");
  const percentEl = document.getElementById("loading-percentage");
  
  if (textEl && text) textEl.textContent = text;
  
  // 目標の数値までアニメーションで徐々に引き上げる
  const step = () => {
    if (currentLoadingProgress < targetPercent) {
      currentLoadingProgress += 2; // 2%ずつ増加
      if (currentLoadingProgress > targetPercent) currentLoadingProgress = targetPercent;
      
      if (bar) bar.style.background = `conic-gradient(#3498db ${currentLoadingProgress}%, #e2e8f0 ${currentLoadingProgress}%)`;
      if (percentEl) percentEl.textContent = `${Math.floor(currentLoadingProgress)}%`;
      
      if (currentLoadingProgress < targetPercent) {
        requestAnimationFrame(step);
      }
    }
  };
  requestAnimationFrame(step);
}


// ==========================================
// 初期化処理（ページを開いた時に実行）
// ==========================================
async function initLocaGame() {
  try {
    // 今日の日付を取得（YYYY-MM-DD形式）
    const todayStrD = new Date().toLocaleDateString('sv-SE'); 
    
    // 初回ログイン日がなければ今日を記録する
    if (!locaMeta.firstLoginDate) locaMeta.firstLoginDate = todayStrD;
    
    // 最終ログイン日が今日でなければ、連続ログイン日数を計算して更新する
    if (locaMeta.lastLoginDate !== todayStrD) {
      if (locaMeta.lastLoginDate) {
        let yesterday = new Date(); 
        yesterday.setDate(yesterday.getDate() - 1);
        let yStr = yesterday.toLocaleDateString('sv-SE');
        locaMeta.consecutiveLoginDays = (locaMeta.lastLoginDate === yStr) ? locaMeta.consecutiveLoginDays + 1 : 1;
      } else {
        locaMeta.consecutiveLoginDays = 1;
      }
      locaMeta.lastLoginDate = todayStrD;
      localStorage.setItem("ekiLocateMeta", JSON.stringify(locaMeta));
    }
    
    // ユーザーが設定していたテーマカラーを復元して適用する
    if (locaSettings.theme) document.body.classList.add(locaSettings.theme);
    
    // 【進捗10%】システム起動
    updateLocaLoadingProgress(10, "システムを起動中...");
    
    // 1. 日本時間（JST）ベースの日付インデックスを計算します
    const t = new Date();
    const jstMs = t.getTime() + (t.getTimezoneOffset() * 60000) + (9 * 3600000);
    const jstObj = new Date(jstMs);
    const todayUTC = Date.UTC(jstObj.getFullYear(), jstObj.getMonth(), jstObj.getDate());
    const baseUTC = Date.UTC(2024, 0, 1);
    currentDayIndex = Math.round((todayUTC - baseUTC) / 86400000);

    // 【進捗30%】ダウンロード開始
    updateLocaLoadingProgress(30, "駅データをダウンロード中...");

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

      // 【進捗60%】保管完了
      updateLocaLoadingProgress(60, "データを安全に保管中...");

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

    // 【進捗80%】問題生成
    updateLocaLoadingProgress(80, "今日の問題を構築中...");

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

    // 【進捗100%】完了
    updateLocaLoadingProgress(100, "出発進行！");

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

    // 100%表示になってから、コンマ数秒の綺麗な余韻を持たせてロード画面を非表示にします
    setTimeout(() => {
      const loader = document.getElementById("loading-screen");
      if (loader) loader.classList.add("hidden");
    }, 400);

  } catch (e) {
    console.error("予期せぬエラーが発生しました:", e);
    alert("ゲームの起動に失敗しました。");
  }
}


// ==========================================
// ゲーム開始と再開の処理
// ==========================================
function startGame(difficulty) {
  // 1. 選択された難易度を記憶し、対応する正解駅をセットします
  currentDifficulty = difficulty;
  todayLocaStation = currentDifficulty === 'hard' ? todayLocaStationHard : todayLocaStationNormal;

  // 2. セーブデータからその難易度の履歴や回答回数を読み込みます
  const state = locaSavedState[currentDifficulty];
  locaGridHistory = state.history || [];
  locaGuessesCount = state.guessesCount || 0;
  
  // 3. 画面上の表（結果履歴）と入力欄を一度空っぽにして綺麗にします
  document.getElementById("results-tbody").innerHTML = "";
  document.getElementById("station-search-input").value = "";

  // 4. セーブデータに残っている過去の回答を、1行ずつ盤面に描き戻します
  locaGridHistory.forEach(h => {
    // 【重要】過去のセーブデータに「距離の数値（distanceNum）」が含まれていない場合の互換性対策
    let distNum = h.distanceNum;
    if (distNum === undefined && h.guess && todayLocaStation) {
      // 距離を再計算して補完し、データにも保存しておきます
      distNum = calculateDistance(h.guess.latitude, h.guess.longitude, todayLocaStation.latitude, todayLocaStation.longitude);
      h.distanceNum = distNum;
    }
    // 1行分のHTMLを生成して画面に追加します
    renderResultRow(h.guess, distNum, h.direction, h.region, h.comp, h.line, h.isWin);
  });

  // 5. 最新の状態をセーブデータに保存します
  saveLocaGameState();

  // 6. モード選択画面を隠し、メインのゲーム画面を表示します
  document.getElementById('difficulty-screen').style.display = 'none';
  document.getElementById('main-game-screen').style.display = 'block';

  // 7. 各種UI（バッジやボタン）の表示を制御します
  // ハードモードの時だけ専用バッジを表示します
  const badge = document.getElementById("hard-mode-badge");
  if (badge) {
    badge.style.display = currentDifficulty === 'hard' ? 'inline-block' : 'none';
  }
  
  // 左上の戻るボタンと、残り回答数のテキストを表示します
  const topBackBtn = document.getElementById('top-back-btn');
  if (topBackBtn) topBackBtn.style.display = 'inline-flex';
  
  const remainDisplay = document.getElementById('remaining-guesses-display');
  if (remainDisplay) remainDisplay.style.display = 'block';
  
  // 残り回答数の数値を最新の状態に更新します
  updateRemainingGuesses();

  // 8. すでにゲームが終了（クリアまたはゲームオーバー）しているかの判定
  if (state.isOver) {
    // 終わっている場合は、送信ボタンと入力欄を無効化（ロック）します
    document.getElementById("submit-guess-btn").disabled = true;
    document.getElementById("station-search-input").disabled = true;
  } else {
    // まだ続いている場合は、入力できるようにロックを解除します
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

  // 勝敗の確定チェックと、結果ウィンドウの確実なタイマー起動
  if (isWin) {
    saveLocaStats(true);
    saveLocaGameState();
    document.getElementById("submit-guess-btn").disabled = true;
    document.getElementById("station-search-input").disabled = true;
    
    // 0.4秒の余韻の後に、結果ウィンドウを確実にポップアップさせます
    setTimeout(() => { showLocaResultModal(true); }, 400);
  } else if (locaGuessesCount >= MAX_LOCA_GUESSES) {
    saveLocaStats(false);
    saveLocaGameState();
    document.getElementById("submit-guess-btn").disabled = true;
    document.getElementById("station-search-input").disabled = true;
    
    // ゲームオーバー時も同様に結果ウィンドウをポップアップさせます
    setTimeout(() => { showLocaResultModal(false); }, 400);
  } else {
    //途中のプレイ状況保存
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

  // 【工夫】正解(isWin)ではない場合、ターゲットまでの残り距離に応じて色を4段階に変えます
  let distClass = "dist-far"; 
  if (!isWin) {
    if (distance <= 10.0) {
      distClass = "dist-closest";  // 10km以内：赤橙色
    } else if (distance <= 50.0) {
      distClass = "dist-closer";   // 50km以内：オレンジ
    } else if (distance <= 200.0) {
      distClass = "dist-close";    // 200km以内：黄色
    }
  }

  // 駅名セルを正解時に緑色にするためのクラス
  const nameClass = isWin ? "cell-station-name cell-correct" : "cell-station-name";

  // 🎯を真ん中にし、距離のテキストは左寄せを維持するHTMLの出し分け
  const distHtml = isWin 
    ? `🎯` 
    : `<span style="display:inline-block; width:55px; text-align:left;">${distance} km</span>`;

  tr.innerHTML = `
    <td class="${nameClass}">${guess.kanji}</td>
    <td class="${isWin ? 'cell-correct' : distClass}" style="${isWin ? 'text-align:center;' : ''}">
      ${distHtml}
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
  
  // 共通の「モード選択に戻る」処理をまとめた関数を作成します（コードの重複を防ぐためのメモ）
  const returnToDiffScreen = () => {
    document.getElementById("main-game-screen").style.display = "none";
    document.getElementById("difficulty-screen").style.display = "block";
    
    // モード選択画面に戻ったら、ハードモードのバッジや不要なUIを確実に隠す
    const badge = document.getElementById("hard-mode-badge");
    if (badge) badge.style.display = "none";
    
    const topBackBtn = document.getElementById("top-back-btn");
    if (topBackBtn) topBackBtn.style.display = "none";
    
    const remainDisplay = document.getElementById('remaining-guesses-display');
    if (remainDisplay) remainDisplay.style.display = 'none';
  };

  // ① 左上の「←」戻るボタンを押したときの処理
  const topBackBtn = document.getElementById("top-back-btn");
  if (topBackBtn) {
    topBackBtn.addEventListener("click", returnToDiffScreen);
  }

  // ② サイドメニュー内の「モード選択に戻る」ボタンを押したときの処理
  const sideBackBtn = document.getElementById("side-back-to-diff-btn");
  if (sideBackBtn) {
    sideBackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeSideMenu(); // サイドメニューを閉じる
      returnToDiffScreen(); // 共通の戻る処理を呼び出す
    });
  }
  
  // ヘルプ画面
  document.getElementById("help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "flex");
  document.getElementById("close-help-btn").addEventListener("click", () => document.getElementById("help-modal").style.display = "none"); 

  // 【修正】グラフボタンのバグ修正（クリア後のリロードでも確実に表示させる）
  document.getElementById("stats-btn").addEventListener("click", () => {
    let targetDiff = currentDifficulty || locaSavedState.lastPlayed;
    if (targetDiff && locaSavedState[targetDiff] && locaSavedState[targetDiff].isOver) {
      const hist = locaSavedState[targetDiff].history;
      const isWin = hist.length > 0 && hist[hist.length - 1].isWin;
      
      // 今日の答えが未セットなら復元する安全装置
      if (!todayLocaStation) {
          todayLocaStation = targetDiff === 'hard' ? todayLocaStationHard : todayLocaStationNormal;
      }
      if (locaGridHistory.length === 0) {
          locaGridHistory = hist;
          currentDifficulty = targetDiff;
      }
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

  // 【修正】テーマボタンで色を変えた時に設定を保存する
  const themes = ["", "theme-dark", "theme-sakura", "theme-ocean", "theme-green", "theme-blue"];
  document.getElementById("theme-btn").addEventListener("click", () => {
    let currentIdx = themes.indexOf(locaSettings.theme);
    if (currentIdx === -1) currentIdx = 0;
    
    if (themes[currentIdx] !== "") document.body.classList.remove(themes[currentIdx]);
    let nextIdx = (currentIdx + 1) % themes.length;
    if (themes[nextIdx] !== "") document.body.classList.add(themes[nextIdx]);
    
    locaSettings.theme = themes[nextIdx];
    localStorage.setItem("ekiLocateSettings", JSON.stringify(locaSettings));
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
  document.getElementById("modal-title").textContent = isWin ? "正解！おめでとう！" : "残念！ゲームオーバー";
  
  // 正解駅名の下に、立体化されたWikipediaを見るボタンを動的に配置します ※廃止
  // let wikiUrl = todayLocaStation.url || "https://ja.wikipedia.org/";
  document.getElementById("modal-desc").innerHTML = `
    <span style="font-size:18px; font-weight:bold;">${todayLocaStation.kanji}</span><br>
    <span style="font-size:14px; color:#7f8c8d;">(${todayLocaStation.pref}${todayLocaStation.municipality})</span><br>
  `;

  // 【修正】お取り寄せ・ふるさと納税用に、常に市区町村単位の正確な地域名を作成
  let safePref = todayLocaStation.pref || "富山県";
  let searchMuni = todayLocaStation.municipality || "富山市";
  let searchWard = todayLocaStation.ward || "";
  let muniMuni = searchMuni // + searchWard; // 例：「島根県江津市」

  // トラベル用の都会・田舎のキーワード分岐（宿泊施設の件数0を回避するためトラベル側のみ維持）※廃止済み条件分岐
  let isRural = todayLocaStation.population < 0; // todayLocaStation.muni_type === "町" || todayLocaStation.muni_type === "村" || ※廃止済み条件分岐
  let areaKeyword = isRural ? safePref : muniMuni;
  let searchKw = typeof isAprilFoolMode!=="undefined"&&isAprilFoolMode ? safePref : areaKeyword;
  
  // ポップアップ内のPR用バナー文言（トラベル用に修正）
  let prText = typeof isAprilFoolMode!=="undefined"&&isAprilFoolMode 
    ? `＼ 聖地のある「${safePref}」へ巡礼して指の疲れを癒やす ／` 
    : `＼ この駅のある「${isRural ? safePref : safePref + muniMuni}」へ聖地巡礼に行こう！ ／`;

  // 1段目：宿・ホテル予約（既存のトラベルURL）
  let encodedStation=encodeURIComponent(encodeURIComponent(encodeURIComponent(searchKw)));
  let yahooUrl=`https://px.a8.net/svt/ejp?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2&a8ejpredirect=https%3A%2F%2Ftravel.yahoo.co.jp%2FikCo.ashx%3Fcosid%3Dy_a8net%26surl%3Dhttps%253A%252F%252Ftravel.yahoo.co.jp%252Fsearch%253Fadc%253D1%2526discsort%253D1%2526kwd%253D${encodedStation}%2526lc%253D1%2526ppc%253D2%2526rc%253D1%2526si%253D6`;
  let yahooImp='<img border="0" width="1" height="1" src="https://www10.a8.net/0.gif?a8mat=4B5NW1+DE94S2+4ZCO+BW8O2" alt="" style="display:none;">';
  let rakutenKeyword=encodeURIComponent(encodeURIComponent(searchKw));
  let rakutenUrl=`https://af.moshimo.com/af/c/click?a_id=5616621&p_id=55&pc_id=55&pl_id=624&url=https%3A%2F%2Fkw.travel.rakuten.co.jp%2Fkeyword%2FSearch.do%3Fcharset%3Dutf-8%26f_max%3D30%26l-id%3DtopC_search_keyword%26f_query%3D${rakutenKeyword}`;
  let rakutenImp='<img src="//i.moshimo.com/af/i/impression?a_id=5616621&p_id=55&pc_id=55&pl_id=624" width="1" height="1" style="border:none;" alt="" loading="lazy">';

  // 2段目：通常のお取り寄せ（楽天側もご提示いただいた半角プラス区切りへ修正）
  let yahooShoppingDest = `https://shopping.yahoo.co.jp/search/${encodeURIComponent(muniMuni)}+${encodeURIComponent("特産品")}/0/?area=13&first=1&ss_first=1&sretry=0&tab_ex=commerce`;
  let yahooShoppingUrl = `https://af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=${encodeURIComponent(yahooShoppingDest)}`;
  let yahooShoppingImp = '<img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">';

  let rakutenMarketDest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(muniMuni)}+${encodeURIComponent("特産品")}/`;
  let rakutenMarketUrl = `https://af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=${encodeURIComponent(rakutenMarketDest)}`;
  let rakutenMarketImp = '<img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">';

  // 3段目：ふるさと納税（こちらも同様に半角プラス区切りへ統一）
  let yahooFurusatoDest = `https://shopping.yahoo.co.jp/search/${encodeURIComponent(muniMuni)}+${encodeURIComponent("ふるさと納税")}/0/?first=1&ss_first=1&sretry=0&tab_ex=commerce`;
  let yahooFurusatoUrl = `https://af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=${encodeURIComponent(yahooFurusatoDest)}`;
  let yahooFurusatoImp = '<img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">';

  let rakutenFurusatoDest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(muniMuni)}+${encodeURIComponent("ふるさと納税")}/`;
  let rakutenFurusatoUrl = `https://af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=${encodeURIComponent(rakutenFurusatoDest)}`;
  let rakutenFurusatoImp = '<img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">';

  // 結果画面のHTML書き換え
  document.getElementById("affiliate-container").innerHTML=`
    <div style="margin-bottom:12px;">
    <a href="${todayLocaStation.url}" target="_blank" style="display:inline-block; padding:8px 12px; background-color:#e0e0e0; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:12px;">Wikipediaで見る</a>
    </div>
    <div style="background-color:#fff3e0; border:1px solid #ffcc80; border-radius:6px; padding:10px; margin-bottom:5px; position:relative;">
    <div style="text-align:center; margin-bottom:8px;">
    <span style="display:inline-block; border:1px solid #aaa; border-radius:4px; padding:1px 6px; font-size:10px; color:#aaa; font-weight:bold;">PR</span>
    </div>
    <div style="font-size:11px; font-weight:bold; color:#e65100; margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${prText}</div>
    <div style="display:flex; justify-content:center; gap:8px; align-items:center; flex-wrap:wrap;">
    <a href="${yahooUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#ffffff; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">
    <img src="/yahoo_japan_icon_64.svg" alt="Y!" style="height:14px; margin-right:4px; border:none;">トラベル
    </a>
    <a href="${rakutenUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:0; background-color:#00B900; border:1px solid #00B900; border-radius:4px; width:45%; height:32px; overflow:hidden;">
    <img src="/R_Travel_v2.04.svg" alt="楽天トラベル" style="height:100%; border:none;">
    </a>
    <div style="width:100%; border-top:1px dashed #ffcc80; margin:6px 0;"></div>
    <div style="width:100%; font-size:11px; font-weight:bold; color:#e65100; margin-bottom:4px; text-align:left; padding-left:5%;">🎁 この土地の名産品をお取り寄せ（通常購入）</div>
    <a href="${yahooShoppingUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#ffffff; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">
    <img src="/yahoo_japan_icon_64.svg" alt="Y!" style="height:14px; margin-right:4px; border:none;">ショッピング
    </a>
    <a href="${rakutenMarketUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#bf0000; color:#ffffff; border:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">
    楽天市場で探す
    </a>
    <div style="width:100%; border-top:1px dashed #ffcc80; margin:6px 0;"></div>
    <div style="width:100%; font-size:11px; font-weight:bold; color:#e65100; margin-bottom:4px; text-align:left; padding-left:5%;">🗾 地域を応援して名産品を貰う（ふるさと納税）</div>
    <a href="${yahooFurusatoUrl}" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#ffffff; border:1px solid #ff0033; color:#333; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">
    <img src="/yahoo_japan_icon_64.svg" alt="Y!" style="height:14px; margin-right:4px; border:none;">ふるさと納税
    </a>
    <a href="${rakutenFurusatoUrl}" target="_blank" style="display:flex; justify-content:center; align-items:center; padding:8px 0; background-color:#7a0000; color:#ffffff; border:none; border-radius:4px; font-weight:bold; font-size:11px; width:45%;">
    楽天ふるさと納税
    </a>
    </div>
    </div>
    ${rakutenImp}
    ${yahooImp}
    ${rakutenMarketImp}
    ${yahooShoppingImp}
    ${yahooFurusatoImp}
    ${rakutenFurusatoImp}
    `;

  // シェア用の絵文字グリッドを表示
  // シェア時と同じ絵文字の順番（地域→事業者→路線→方角→距離）でグリッドを表示します
  const colorToEmoji = {"cell-correct":"🟩", "cell-present":"🟨", "cell-absent":"⬛"};
  const gridHTML = locaGridHistory.map(row => {
    return `${colorToEmoji[row.region]}${colorToEmoji[row.comp]}${colorToEmoji[row.line]} ${row.direction} ${row.distance}`;
  }).join("<br>");
  document.getElementById("modal-grid").innerHTML = gridHTML;

  // 現在のモードの戦績データを読み込む（データがなければ初期値をセット）
  let st = locaStats[currentDifficulty];
  if (!st) st = {played:0, won:0, currentStreak:0, maxStreak:0, dist:[0,0,0,0,0,0,0,0,0,0,0]};
  
  // HTMLの各項目（プレイ回数、勝率、連勝記録など）に計算した数値を書き込む
  const elPlayed = document.getElementById("stat-played");
  const elWinRate = document.getElementById("stat-winrate");
  const elStreak = document.getElementById("stat-streak");
  const elMaxStreak = document.getElementById("stat-maxstreak");
  
  if(elPlayed) elPlayed.textContent = st.played;
  if(elWinRate) elWinRate.textContent = st.played > 0 ? Math.round((st.won / st.played) * 100) : 0;
  if(elStreak) elStreak.textContent = st.currentStreak;
  if(elMaxStreak) elMaxStreak.textContent = st.maxStreak;

  // 回答数分布の簡易棒グラフを動的に生成するロジック
  const graphBars = document.getElementById("stats-graph-bars");
  if (graphBars && st.dist) {
    graphBars.innerHTML = "";
    
    // 1手〜10手の中で、一番多かったクリア回数（最大値）を探して基準にします
    let maxCount = 1;
    for (let i = 1; i <= 10; i++) {
      if ((st.dist[i] || 0) > maxCount) maxCount = st.dist[i];
    }
    
    // 1手から10手までのグラフバーを1本ずつ組み立てます
    for (let i = 1; i <= 10; i++) {
      const count = st.dist[i] || 0;
      const barWidth = Math.max(8, Math.round((count / maxCount) * 100)); // 最低でも8%の長さを保証
      const barColor = (i === locaGuessesCount) ? "#3498db" : "#787c7e"; // 今回クリアした手数のバーだけ水色にする
      
      const barRow = document.createElement("div");
      barRow.style.display = "flex";
      barRow.style.alignItems = "center";
      barRow.style.fontSize = "11px";
      
      barRow.innerHTML = `
        <div style="width:25px; text-align:right; padding-right:6px; font-weight:bold; color:#64748b;">${i}</div>
        <div style="flex:1; background:#f1f5f9; border-radius:3px; height:16px;">
          <div style="background:${barColor}; width:${barWidth}%; height:100%; border-radius:3px; color:#fff; font-weight:bold; font-size:10px; display:flex; align-items:center; justify-content:flex-end; padding-right:4px; box-sizing:border-box;">
            ${count > 0 ? count : ''}
          </div>
        </div>
      `;
      graphBars.appendChild(barRow);
    }
  }

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
  
  // 現在遊んでいる難易度の状態を保存します
  locaSavedState[currentDifficulty] = {
    guessesCount: locaGuessesCount,
    history: locaGridHistory,
    isOver: locaGuessesCount >= MAX_LOCA_GUESSES || (locaGridHistory.length > 0 && locaGridHistory[locaGridHistory.length - 1].isWin)
  };
  
  // 日付と、最後に遊んだモードを共通データとして記憶します
  locaSavedState.date = currentDayIndex;
  locaSavedState.lastPlayed = currentDifficulty; 
  
  localStorage.setItem("ekiLocateStateV2", JSON.stringify(locaSavedState));
}


function restoreLocaGameState() {
  // 日付が変わっていれば、過去の履歴データを初期化する処理
  if (locaSavedState.date !== currentDayIndex || !locaSavedState.normal) {
    locaSavedState = {
      date: currentDayIndex,
      normal: {guessesCount: 0, history: [], isOver: false},
      hard: {guessesCount: 0, history: [], isOver: false},
      lastPlayed: null
    };
    localStorage.setItem("ekiLocateStateV2", JSON.stringify(locaSavedState));
  }

  // 前回遊んだモードの記憶を無視し、必ずモード選択画面を最初に表示させます
  document.getElementById('difficulty-screen').style.display = 'block';
  document.getElementById('main-game-screen').style.display = 'none';
  
  // モード選択画面の時点では、不要な「←」ボタンと「残り回数」を確実に隠しておきます
  const topBackBtn = document.getElementById('top-back-btn');
  if (topBackBtn) topBackBtn.style.display = 'none';
  
  const remainDisplay = document.getElementById('remaining-guesses-display');
  if (remainDisplay) remainDisplay.style.display = 'none';
}

// ==========================================
// 戦績とメタデータの保存処理
// ==========================================
function saveLocaStats(isWin) {
  let st = locaStats[currentDifficulty];
  st.played++; // プレイ回数を加算
  
  const todayStrD = new Date().toLocaleDateString('sv-SE');

  if (isWin) {
    st.won++; // 勝利回数を加算
    st.currentStreak++; // 現在の連勝記録を加算
    if (st.currentStreak > st.maxStreak) st.maxStreak = st.currentStreak; // 最大連勝記録を更新
    st.dist[locaGuessesCount] = (st.dist[locaGuessesCount] || 0) + 1; // クリアまでの手数を記録
    if (!st.clearedDates.includes(todayStrD)) st.clearedDates.push(todayStrD);
    
    // 駅図鑑に正解した駅を登録（重複なし）
    if (todayLocaStation && !locaMeta.unlockedStations.includes(todayLocaStation.kanji)) {
       locaMeta.unlockedStations.push(todayLocaStation.kanji);
    }

    // 共通の連続クリア日数計算
    if (locaMeta.lastClearDate !== todayStrD) {
      if (locaMeta.lastClearDate) {
        let yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        let yStr = yesterday.toLocaleDateString('sv-SE');
        locaMeta.consecutiveClearDays = (locaMeta.lastClearDate === yStr) ? locaMeta.consecutiveClearDays + 1 : 1;
      } else {
        locaMeta.consecutiveClearDays = 1;
      }
      locaMeta.lastClearDate = todayStrD;
    }
  } else {
    // 負けた場合は連勝記録をリセット
    st.currentStreak = 0;
  }
  
  // 保存箱（ローカルストレージ）に最新データを書き込む
  localStorage.setItem("ekiLocateStatsV2", JSON.stringify(locaStats));
  localStorage.setItem("ekiLocateMeta", JSON.stringify(locaMeta));
}


// 画面の準備ができたらゲームスタート
window.addEventListener("DOMContentLoaded", initLocaGame);
