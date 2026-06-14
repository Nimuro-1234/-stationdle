// ==========================================
// 駅ロケ専用の共通変数とセーブデータ
// ==========================================
let currentDayIndex = 0; // 今日が基準日から何日目かを全関数で共有する箱
let todayLocaStationNormal = null; // 通常モード用の正解駅
let todayLocaStationHard = null;   // ハードモード用の正解駅
// タイマー計算用の一時変数
let locaPlayStartTime = null; 
let locaCurrentClearTime = null;

// モード別の戦績データ（手数、勝率、連勝記録、クリアした日付、最速タイムなど）
let locaStats = JSON.parse(localStorage.getItem("ekiLocateStatsV2") || JSON.stringify({
  normal: { played:0, won:0, currentStreak:0, maxStreak:0, dist:[0,0,0,0,0,0,0,0,0,0,0], clearedDates:[], fastestTime: null },
  hard:   { played:0, won:0, currentStreak:0, maxStreak:0, dist:[0,0,0,0,0,0,0,0,0,0,0], clearedDates:[], fastestTime: null }
}));


// エンドレスモードのセーブデータ（山札の状態、スコア、コンボ、残り回数などを一括管理）
let locaEndlessState = JSON.parse(localStorage.getItem("ekiLocateEndlessDeck") || JSON.stringify({
  deck: [],               // シャッフルされた駅インデックスの配列
  currentIndex: 0,        // 現在山札の何枚目を引いているか
  score: 0,               // 現在の総スコア
  combo: 0,               // 現在の連勝数
  maxCombo: 0,            // 今回のプレイでの最高連勝数
  clearedCount: 0,        // 正解した駅の合計数
  remainingGuesses: 15,   // 現在の残り回答可能数
  lastAnswerStation: null // 前回クリア（またはスキップ）した駅のデータ
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

    // 出題可能駅をフィルタする
    locaStations = rawStations.filter(s => {
      // 1. 緯度・経度の欠損チェック（一番処理が軽く、無効なデータを即弾けるため最優先）
      if (s.latitude === undefined || s.latitude === null || s.longitude === undefined || s.longitude === null) return false;

      // 2. 貨物駅のチェック
      if (s.companies && s.companies.length === 1 && s.companies[0] === "日本貨物鉄道") return false;

      // 3. 未来駅・廃止駅のチェック
      if (s.startDay !== undefined && s.startDay > currentDayIndex) return false;
      if (s.endDay !== undefined && s.endDay !== 999999 && s.endDay <= currentDayIndex - 33) return false;

      // 全ての関門を突破した駅だけを残す
      return true;
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
      // 入力窓が選択されたらタイマーをスタートする処理
      searchInput.addEventListener("focus", () => {
        // エンドレスモードと通常モードで、ゲーム終了の判定先を分けます
        let isOver = false;
        if (currentDifficulty === 'endless') {
           // エンドレスモードは残り回数が0以下なら終了扱い
           isOver = (locaEndlessState.remainingGuesses <= 0);
        } else if (locaSavedState[currentDifficulty]) {
           // 通常モードは既存のセーブデータを確認
           isOver = locaSavedState[currentDifficulty].isOver;
        }
        
        // タイマーがまだ動いておらず、かつゲームオーバーでなければ計測開始
        if (!locaPlayStartTime && !isOver) {
          locaPlayStartTime = Date.now();
        }
      });

      // （既存）Enterキーの処理
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
  // 距離計算
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


// ==========================================
// 入力サジェスト（候補リスト）機能の設定
// ==========================================
// 検索時に新字体と旧字体の揺れを吸収し、統一して比較するための変換関数
function normalizeKanjiForSearch(str) {
  if (!str) return "";
  return str.replace(/俱/g, "倶")
            .replace(/澤/g, "沢")
            .replace(/濱/g, "浜")
            .replace(/櫻/g, "桜")
            .replace(/眞/g, "真")
            .replace(/ヶ/g, "ケ")
            .replace(/驛/g, "駅")
            .replace(/鐡/g, "鉄")
            .replace(/鐵/g, "鉄")
            .replace(/竈/g, "釜")
            .replace(/竃/g, "釜");
}


// ==========================================
// サジェスト処理
// ==========================================
function setupSuggest() {
  const input = document.getElementById("station-search-input");
  const list = document.getElementById("suggest-list");

  // 【1】文字が入力されるたびに実行される処理
  input.addEventListener("input", (e) => {
    // プレイヤーの入力値（e.target.value）を、まず新字体に変換してから、
    // 入力文字の全角英数字を半角にし、小文字化し、スペース（全角・半角）を全て消した上でひらがなにする
    let rawInput = e.target.value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
    const query = toHiragana(normalizeKanjiForSearch(rawInput).toLowerCase().replace(/[\s ]+/g, ""));
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

      // エラー防止のため、データがない場合は空文字を代入して安全に比較する
      const pref = s.pref || "";
      const muni = s.municipality || "";
      const ward = s.ward || "";
      // ----------------------------------------------------
      // 【修正後】
      // ----------------------------------------------------
      const originalKanji = s.kanji || "";
      const baseKanji = normalizeKanjiForSearch(originalKanji);
      
      // 【追加】カッコ（半角・全角）とその中身を無視した純粋な文字数を計算（朝倉駅 (愛知県) → 「朝倉駅」の3文字として評価）
      const scoreLen = baseKanji.replace(/[\(（].*?[\)）]/g, "").trim().length;

      // 辞書側の文字も全角英数を半角・小文字化・スペース全削除して比較用（裏側専用）にする
      let rawKanji = baseKanji.replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
      const kanji = rawKanji.toLowerCase().replace(/[\s ]+/g, "");
      const kanjiHira = toHiragana(kanji);
      const yomi = (s.yomi || s.hiragana || "").replace(/[\s ]+/g, ""); 

      // 1. 完全一致
      if (kanji === query || kanjiHira === query || yomi === query) {
        matchReason = `${pref}${muni}${ward}`;
        score = 1000;
      } 
      // 2. 頭文字からの前方一致
      else if (kanji.startsWith(query) || kanjiHira.startsWith(query) || yomi.startsWith(query)) {
        matchReason = `${pref}${muni}${ward}`;
        score = 500 - scoreLen; // kanji.length の代わりに scoreLen を使用
      } 
      // 3. 文字の部分一致
      else if (kanji.includes(query) || kanjiHira.includes(query) || yomi.includes(query)) {
        matchReason = `${pref}${muni}${ward}`;
        score = 100 - scoreLen; // kanji.length の代わりに scoreLen を使用
      }
      // 4. 地域（都道府県＋市区町村、または市区町村単体の検索でもヒットさせる）
      else if ((pref + muni + ward).includes(query) || muni.includes(query) || ward.includes(query)) {
        matchReason = `📍 ${pref}${muni}${ward}`;
        score = 50;
      } 
      // 5. 路線
      else if (s.lines && s.lines.some(l => l.includes(query) || toHiragana(l).includes(query))) {
        const matchedLine = s.lines.find(l => l.includes(query) || toHiragana(l).includes(query));
        matchReason = `🚃 ${matchedLine}`;
        score = 30;
      } 
      // 6. 事業者
      else if (s.companies && s.companies.some(c => c.includes(query) || toHiragana(c).includes(query))) {
        const matchedComp = s.companies.find(c => c.includes(query) || toHiragana(c).includes(query));
        matchReason = `🏢 ${matchedComp}`;
        score = 10;
      }

      // スコアが1以上の駅だけを結果リストに追加
      if (score > 0) {
        results.push({ station: s, reason: matchReason, score: score });
      }
    }

    // スコアが高い順（1000→500...）に並び替え
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, 50); // 上位50件のみ表示してメモリを節約

    // 結果が0件の時はリストを隠し、1件以上ある時は確実に再表示させる
    if (results.length === 0) {
      list.style.display = "none";
    } else {
      list.style.display = "block";
      renderSuggestList(results);
    }
  }); 
  // 【修正】ここに誤って書かれていた `}` を一番下へ移動しました

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
} // 【修正】関数の正しい終わりはここです


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
  const display = document.getElementById("remaining-guesses-display");
  if (!display) return;
  
  if (currentDifficulty === 'endless') {
      display.textContent = `残り回答可能数：${locaEndlessState.remainingGuesses} 回`;
  } else {
      const remain = MAX_LOCA_GUESSES - locaGuessesCount;
      display.textContent = `残り回答可能数：${remain} 回`;
  }
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
  
  // サジェストから選ばれていない（手打ちされた）場合の救済処理
  if (!currentSelectedStation) {
    
    // まず、入力欄の文字を丸ごと取得する際に、新字体へ変換して統一しておきます
    let inputVal = normalizeKanjiForSearch(input.value);
    
    // 手打ちされた文字の末尾に「駅」が付いていたら、裏でこっそり消します（横浜駅 → 横浜）
    //if (inputVal.endsWith("駅") && inputVal.length > 1) {
    //  inputVal = inputVal.slice(0, -1);
    //}

    // 辞書の駅名（s.kanji）と、プレイヤーの入力文字（inputVal）を比較します
    const exactMatches = locaStations.filter(
      // 辞書側の駅名も念のため新字体に変換した上で、新字体同士で完全一致するかチェックします
      s => normalizeKanjiForSearch(s.kanji) === inputVal || (s.hiragana && s.hiragana === inputVal)
    );
    
    if (exactMatches.length === 1) {
      // 候補が1つだけなら、選ばれた状態にします
      currentSelectedStation = exactMatches[0];
      
      // 入力欄の文字を正式な駅名に綺麗に書き換えます（inputElエラーの修正箇所です）
      input.value = currentSelectedStation.kanji;
      
    } else if (exactMatches.length > 1) {
      alert("同名の駅が複数存在します。サジェストリストから該当する地域のものを選んでください。");
      return;
      
    } else {
      alert("駅が見つかりません。リストから選択するか、正しい駅名を入力してください。");
      return;
    }
  }

  // エンドレスモードと通常モードで、制限に引っかかる条件を分けます
  if (currentDifficulty === 'endless') {
    // エンドレスモードの場合は、全体の手数が0以下の時だけブロックします
    if (locaEndlessState.remainingGuesses <= 0) {
      alert("すでに規定の回数に達しています！");
      return;
    }
  } else {
    // 通常・ハードモードの場合は、1問あたりの回答回数（MAX_LOCA_GUESSES）でブロックします
    if (locaGuessesCount >= MAX_LOCA_GUESSES) {
      alert("すでに規定の回数に達しています！");
      return;
    }
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

  // ▼▼▼ ここから追加（1手ごとのテンポアップボーナス） ▼▼▼
  if (currentDifficulty === 'endless' && !isWin) {
    // 経過時間を秒で取得（5分＝300秒）
    let guessTimeSec = locaPlayStartTime ? Math.floor((Date.now() - locaPlayStartTime) / 1000) : 0;
    
    // スピードボーナス：最速500pt〜5分で0ptになるように減衰
    let speedBonus = Math.max(0, 500 - Math.floor(guessTimeSec * 1.66));
    
    // 距離ボーナス：最大500pt（10km以内）〜最低50pt（300km以上）
    let distBonus = 50; 
    if (distance <= 10) distBonus = 500;
    else if (distance <= 50) distBonus = 300;
    else if (distance <= 100) distBonus = 200;
    else if (distance <= 300) distBonus = 100;

    // ▼▼▼ 追加：パネルの色に応じた的中ボーナス ▼▼▼
    const getPanelBonus = (status) => status === "cell-correct" ? 1000 : (status === "cell-present" ? 300 : 0);
    let colorBonus = getPanelBonus(regionStatus) + getPanelBonus(compStatus) + getPanelBonus(lineStatus);
    
    let earnedPerGuess = speedBonus + distBonus + colorBonus;
    
    // スコアを加算してリアルタイムで画面に反映
    locaEndlessState.score += (speedBonus + distBonus);
    
    const endlessScoreDisplay = document.getElementById("endless-score-display");
    if (endlessScoreDisplay) endlessScoreDisplay.textContent = locaEndlessState.score;

    // ▼▼▼ 追加：入力欄の横から「+xxx」をフワッと浮かび上がらせる演出 ▼▼▼
    const inputWrapper = document.querySelector(".input-wrapper");
    if (inputWrapper) {
      const animEl = document.createElement("div");
      animEl.className = "floating-score";
      animEl.textContent = `+${earnedPerGuess}`;
      inputWrapper.appendChild(animEl);
      // アニメーションが終わる頃（1.2秒後）に要素を消してメモリを掃除
      setTimeout(() => animEl.remove(), 1200);
    }
  }
  // ▲▲▲ ここまで追加 ▲▲
  
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

  
  // 回答回数消費処理
  if (currentDifficulty === 'endless') {
      locaGuessesCount++; // 今回かかった手数をカウント
      locaEndlessState.remainingGuesses--; // 残り15回の枠を消費
  } else {
      locaGuessesCount++;
  }
  updateRemainingGuesses();
  
  input.value = "";
  currentSelectedStation = null;
  document.getElementById("suggest-list").style.display = "none";

  // 勝敗の確定チェックと、結果ウィンドウの確実なタイマー起動
  if (isWin) {
    if (currentDifficulty === 'endless') {
       // 【エンドレス専用の正解処理】
       const clearTime = locaPlayStartTime ? Math.round((Date.now() - locaPlayStartTime) / 100) / 10 : 0;
       const baseScore = 30000; // 基礎スコアを1000→30000へ大幅アップ
       
       let guessBonus = 0;
       if (locaGuessesCount === 1) guessBonus = 5000;
       else if (locaGuessesCount === 2) guessBonus = 3000;
       else if (locaGuessesCount === 3) guessBonus = 1000;
       else if (locaGuessesCount === 4) guessBonus = 500;
       else if (locaGuessesCount === 5) guessBonus = 300;
       else if (locaGuessesCount === 6) guessBonus = 100;
       
       const timeBonus = getEndlessTimeBonus(clearTime);
       
       locaEndlessState.combo++;
       if (locaEndlessState.combo > locaEndlessState.maxCombo) locaEndlessState.maxCombo = locaEndlessState.combo;
       
       const multiplier = getEndlessComboMultiplier(locaEndlessState.combo);
       const earnedScore = Math.floor((baseScore + guessBonus + timeBonus) * multiplier);
       
       locaEndlessState.score += earnedScore;    //スコア加算
       checkAndTriggerHighScoreEffect(locaEndlessState.score);    //ハイスコアチェック
       locaEndlessState.clearedCount++;
       locaEndlessState.lastAnswerStation = guess;
       
       const recovery = getEndlessRecoveryAmount(locaGuessesCount);
       
       // UIを一旦ロック
       document.getElementById("submit-guess-btn").disabled = true;
       document.getElementById("station-search-input").disabled = true;

      // ボーナスの内訳を1つのオブジェクト（箱）にまとめます
       const breakdown = { 
           base: baseScore, 
           guess: guessBonus, 
           time: timeBonus, 
           mult: multiplier.toFixed(1) 
       };
      
       // まとめた内訳（breakdown）を4つ目の引数として確実に渡します
       showEndlessWinPopup(earnedScore, locaEndlessState.combo, recovery, breakdown);
       
    } else {
       // 【通常・ハードモードの正解処理（既存）】
       if (locaPlayStartTime) locaCurrentClearTime = Math.round((Date.now() - locaPlayStartTime) / 100) / 10;
       saveLocaStats(true);
       saveLocaGameState();
       document.getElementById("submit-guess-btn").disabled = true;
       document.getElementById("station-search-input").disabled = true;
       setTimeout(() => { showLocaResultModal(true); }, 400);
    }

  // 残り回数がない場合（ゲームオーバー）
  } else if ((currentDifficulty === 'endless' && locaEndlessState.remainingGuesses <= 0) || 
             (currentDifficulty !== 'endless' && locaGuessesCount >= MAX_LOCA_GUESSES)) {
    if (currentDifficulty === 'endless') {
       document.getElementById("submit-guess-btn").disabled = true;
       document.getElementById("station-search-input").disabled = true;
       setTimeout(() => { showEndlessResultModal(); }, 400); // エンドレス専用の終了画面
    } else {
       saveLocaStats(false);
       saveLocaGameState();
       document.getElementById("submit-guess-btn").disabled = true;
       document.getElementById("station-search-input").disabled = true;
       setTimeout(() => { showLocaResultModal(false); }, 400);
    }
  } else {
    // 途中経過の保存
    if (currentDifficulty === 'endless') {
       locaEndlessState.history = locaGridHistory; // 【追加】履歴を同期
       localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));
       updateEndlessSkipButton(); // 【追加】入力の度にスキップ判定
    } else {
       saveLocaGameState();
    }
  }
}

// 結果をテーブルの1行（<tr>）として組み立てて画面に出す関数
function renderResultRow(guess, distance, direction, regionStatus, compStatus, lineStatus, isWin) {
  const tbody = document.getElementById("results-tbody");
  const tr = document.createElement("tr");

  // 事業者と路線の表示テキストを作ります（長すぎる場合は「〇〇 他」と省略）
  // 後の処理で書き換える可能性があるため、constではなくletで宣言します
  let compText = (guess.companies && guess.companies.length > 0) ? guess.companies[0] + (guess.companies.length > 1 ? ` 他${guess.companies.length - 1}社` : "") : "不明";
  let lineText = (guess.lines && guess.lines.length > 0) ? guess.lines[0] + (guess.lines.length > 1 ? ` 他${guess.lines.length - 1}路線` : "") : "不明";

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

    const endlessBar = document.getElementById("endless-status-bar");
    if (endlessBar) endlessBar.style.display = "none";
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
    
    // 10回制限に合わせ、9・10手用の色も追加したver
    const graphColors = ["#6aaa64", "#42a5f5", "#26c6da", "#ffca28", "#ffa726", "#ff7043", "#ec407a", "#ab47bc", "#8d6e63", "#78909c"];
    
    let maxCount = 1;
    for (let i = 1; i <= 10; i++) {
      if ((st.dist[i] || 0) > maxCount) maxCount = st.dist[i];
    }
    
    // 1手から10手までのグラフバーを1本ずつ組み立てます
    for (let i = 1; i <= 10; i++) {
      const count = st.dist[i] || 0;
      // 0回でも数字が確実に見えるよう、最低でも幅を10%確保します
      const barWidth = Math.max(10, Math.round((count / maxCount) * 100));
      // 回数にかかわらず、配列から専用の色を常に適用します
      const barColor = graphColors[i - 1]; 
      
      // 今回のクリア手数だけ、枠線をつけて目立たせる（任意ですが分かりやすくなります）
      const isCurrent = (i === locaGuessesCount && isWin);
      const highlightStyle = isCurrent ? "border: 2px solid #333;" : "";

      const barRow = document.createElement("div");
      barRow.style.display = "flex";
      barRow.style.alignItems = "center";
      barRow.style.fontSize = "11px";
      
      // 数字を右端に配置（0回でも表示）
      barRow.innerHTML = `
        <div style="width:25px; text-align:right; padding-right:6px; font-weight:bold; color:#64748b;">${i}</div>
        <div style="flex:1; background:#f1f5f9; border-radius:3px; height:18px;">
          <div style="background:${barColor}; width:${barWidth}%; height:100%; border-radius:3px; color:#fff; font-weight:bold; font-size:11px; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; box-sizing:border-box; ${highlightStyle}">
            ${count}
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

    // 動作を最速にするための事前準備（ループの外で各駅に「鍵」を持たせておく）
    for (let i = 0; i < validStations.length; i++) {
       // 緯度・経度があればそれを繋げた文字列を、無ければURLを「同一駅判定用の鍵（_cKey）」にします
       validStations[i]._cKey = (validStations[i].latitude && validStations[i].longitude) 
                                 ? `${validStations[i].latitude},${validStations[i].longitude}` 
                                 : validStations[i].url;
    }

    let lookback = 1000; // 一度出題された駅が、再び出題されるまでの「お休み期間（日数）」
    let nextAvailableDay = new Map(); // 各駅（鍵）が、次回いつ出題可能になるかを高速で記録する帳簿
    let targetNormal = null;
    let targetHard = null;

    // Day 0（基準日）から今日まで、毎日どんな駅が出題されてきたか歴史をシミュレーションします
    for (let d = 0; d <= currentDayIndex; d++) {
      let poolNormal = []; // その日にノーマルモードで出題可能な駅を入れるくじ引き箱
      let poolHard = [];   // その日にハードモードで出題可能な駅を入れるくじ引き箱
      
      // 全駅をチェックして、その日のくじ引き箱に入れるか判定します
      for (let i = 0; i < validStations.length; i++) {
         let s = validStations[i];
         // その日より未来に開業する駅ならスキップ
         if (s.startDay !== undefined && s.startDay > d) continue;
         // その日以前に廃止された駅ならスキップ（999999は廃止予定なしの意味）
         if (s.endDay !== undefined && s.endDay <= d && s.endDay !== 999999) continue;
         // 帳簿を見て、まだ「お休み期間中」の駅ならスキップ
         if ((nextAvailableDay.get(s._cKey) || 0) > d) continue;
         
         // 全ての条件をクリアした駅だけを、くじ引き箱に入れます
         poolNormal.push(s);
         poolHard.push(s);
      }
      
      // 万が一、使える駅が枯渇して箱が空っぽになった場合は、緊急措置として全駅を箱に戻します
      if (poolNormal.length === 0) {
         poolNormal = validStations;
         poolHard = validStations;
      }

      // 【通常モードの抽選】
      // 日付(d)をベースに、毎日変わるけど毎回必ず同じ結果になる計算式（ハッシュ）で乱数を作ります
      let seedN = d * 33333 + 54321;
      let hashN = Math.imul(seedN ^ (seedN >>> 15), 2246822507);
      hashN = Math.imul(hashN ^ (hashN >>> 13), 3266489909);
      hashN = (hashN ^ (hashN >>> 16)) >>> 0;
      
      // 作った乱数を使って、箱の中から1つの駅を選び出します
      let candidateNormal = poolNormal[hashN % poolNormal.length];
      
      // 選ばれた駅（鍵）を帳簿に書き込み、今日から1000日間はお休みにします
      nextAvailableDay.set(candidateNormal._cKey, d + lookback + 1);

      // 【ハードモードの抽選】
      // 今選ばれたばかりのノーマルの駅（同じ座標の駅含む）を、ハード用の箱から取り除いて被りを防ぎます
      poolHard = poolHard.filter(s => s._cKey !== candidateNormal._cKey);
      if (poolHard.length === 0) poolHard = validStations; // 空になったら緊急補充

      // ハードモード専用の計算式（+ 99999）で別の乱数を作ります
      let seedH = d * 33333 + 99999;
      let hashH = Math.imul(seedH ^ (seedH >>> 15), 2246822507);
      hashH = Math.imul(hashH ^ (hashH >>> 13), 3266489909);
      hashH = (hashH ^ (hashH >>> 16)) >>> 0;
      
      // ハードモードの答えを選び出します
      let candidateHard = poolHard[hashH % poolHard.length];
      
      // ハードで選ばれた駅も、同じように1000日間のお休みにします
      nextAvailableDay.set(candidateHard._cKey, d + lookback + 1);

      // シミュレーションが「今日（currentDayIndex）」に到達したら、その答えを最終結果として確定します
      if (d === currentDayIndex) {
        targetNormal = candidateNormal;
        targetHard = candidateHard;
      }
    }
    
    // 確定した今日の答えを変数に格納します
    todayLocaStationNormal = targetNormal;
    todayLocaStationHard = targetHard;
  }

  // 計算結果をキャッシュ（ブラウザの記憶）に保存して、明日になるまでは再計算をスキップ（0秒読み込み）します
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

  const endlessBar = document.getElementById("endless-status-bar");
  if (endlessBar) endlessBar.style.display = "none";
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

    // 【追加】自己ベストタイムの更新処理
    if (locaCurrentClearTime) {
       // まだ記録がない、または今のタイムが過去のベストより早ければ上書きする
       if (st.fastestTime === null || locaCurrentClearTime < st.fastestTime) {
          st.fastestTime = locaCurrentClearTime;
       }
    }
    
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


// ==========================================
// エンドレスモード専用ロジック（山札システムとセーブデータ）
// ==========================================

// 配列の中身をランダムにシャッフルする関数
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// エンドレスモードの次の答えを山札から引く関数
function drawNextEndlessStation() {
  // 山札が空、または2000駅引ききった場合は、新しい山札を生成する
  if (!locaEndlessState.deck || locaEndlessState.deck.length === 0 || locaEndlessState.currentIndex >= 2000) {
    
    let uniqueIndices = []; // 重複していない、かつ出題条件を満たす駅の番号を入れる箱
    let seenKeys = new Set();
    
    // 【修正】辞書の中から、出題にふさわしい駅だけを厳選する
    for (let i = 0; i < locaStations.length; i++) {
      let s = locaStations[i];
      
      // selectTodayLocaStation と完全に一致させた厳格なフィルター
      const isValid = 
          s.latitude !== undefined && s.latitude !== null &&     // 緯度がある
          s.longitude !== undefined && s.longitude !== null &&   // 経度がある
          s.pref !== "" &&                                       // 都道府県名がある
          s.address !== "" &&                                    // 住所がある
          s.min_km !== null &&                                   // 営業キロがある
          s.companies && s.companies.length > 0 &&               // 事業者が登録されている
          !(s.companies.length === 1 && s.companies[0] === "日本貨物鉄道") && // 貨物専用駅ではない
          (s.startDay === undefined || s.startDay <= currentDayIndex) &&    // まだ開業していない未来の駅ではない
          (s.endDay === undefined || s.endDay > currentDayIndex || s.endDay === 999999); // すでに廃止された駅ではない
                      
      if (!isValid) continue; // 条件を満たさない駅は山札に入れない

      // 座標かURLによる重複チェック
      let key = (s.latitude && s.longitude) ? `${s.latitude},${s.longitude}` : s.url;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueIndices.push(i);
      }
    }
    
    // 厳選されたリストをシャッフルして新しい山札にする
    shuffleArray(uniqueIndices);
    
    // 山札を作り直した場合はインデックスを0に戻す（スコア等はそのまま引き継ぐ）
    locaEndlessState.deck = uniqueIndices;
    locaEndlessState.currentIndex = 0;
  }

  // 山札から次の駅を引く
  const targetIndex = locaEndlessState.deck[locaEndlessState.currentIndex];
  const nextStation = locaStations[targetIndex];

  // 次回のためにインデックスを進め、ローカルストレージに保存する
  locaEndlessState.currentIndex++;
  localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));

  return nextStation;
}


// ==========================================
// エンドレスモード：スコア計算ロジック
// ==========================================

// タイムボーナス（最大10分、1分区切り）
function getEndlessTimeBonus(seconds) {
  if (seconds <= 60) return 10000;
  if (seconds <= 120) return 8000;
  if (seconds <= 180) return 6000;
  if (seconds <= 240) return 4000;
  if (seconds <= 300) return 3000;
  if (seconds <= 360) return 2000;
  if (seconds <= 420) return 1500;
  if (seconds <= 480) return 1000;
  if (seconds <= 540) return 500;
  if (seconds <= 600) return 200;
  return 0; // 10分以降
}

// コンボボーナス倍率
function getEndlessComboMultiplier(combo) {
  if (combo <= 0) return 1.0;
  if (combo <= 20) return 1.0 + (combo * 0.1);
  if (combo <= 50) return 3.0 + Math.floor((combo - 20) / 5) * 0.1;
  if (combo <= 100) return 3.6 + Math.floor((combo - 50) / 10) * 0.1;
  if (combo <= 200) return 4.1 + Math.floor((combo - 100) / 20) * 0.1;
  if (combo <= 500) return 4.6 + Math.floor((combo - 200) / 30) * 0.1;
  if (combo <= 1000) return 5.6 + Math.floor((combo - 500) / 50) * 0.1;
  if (combo <= 2000) return 6.6 + Math.floor((combo - 1000) / 100) * 0.1;
  return 7.6; // 2001連勝以降は固定
}


// ==========================================
// エンドレスモード：手数に応じた回復量の計算
// ==========================================
function getEndlessRecoveryAmount(guesses) {
  if (guesses <= 3) return 5;
  if (guesses <= 6) return 4;
  if (guesses <= 10) return 3;
  if (guesses <= 15) return 2;
  return 0; // 万が一のオーバーフロー時
}

// ------------------------------------------
// 【メモ】この関数は、プレイヤーが正解した時に以下のように呼び出して使います。
// （※後ほどエンドレス用の正誤判定処理を組み立てる際に組み込みます）
//
// let recovery = getEndlessRecoveryAmount(locaGuessesCount);
// locaEndlessState.remainingGuesses += recovery;
//
// // 上限突破を防止（最大15回まで）
// if (locaEndlessState.remainingGuesses > 15) {
//   locaEndlessState.remainingGuesses = 15;
// }
// ------------------------------------------


// ====== [app.js] スキップボタンを完全にグレーアウトする共通関数を追加 ======
function updateEndlessSkipButton() {
  const skipBtn = document.getElementById("skip-endless-btn");
  if (!skipBtn) return;
  
  if (locaEndlessState.remainingGuesses <= 3) {
    skipBtn.disabled = true;
    skipBtn.style.opacity = "0.4"; // 薄くして押せない感を出す
    skipBtn.style.cursor = "not-allowed";
  } else {
    skipBtn.disabled = false;
    skipBtn.style.opacity = "1";
    skipBtn.style.cursor = "pointer";
  }
}


// ==========================================
// 次の問題をセットし、前の駅を「0手目のヒント」として自動入力する処理
// ==========================================
function startNextEndlessRound() {
  // 山札から今日の正解駅をセット
  todayLocaStation = drawNextEndlessStation();
  
  // 盤面と履歴をリセット（ただし、残り回答回数は前の状態を引き継ぎます）
  locaGridHistory = [];
  locaGuessesCount = 0; 
  document.getElementById("results-tbody").innerHTML = "";

  // 前回クリア（またはスキップ）した駅の記録があれば、消費ゼロの無料ヒントとして自動入力
  const prev = locaEndlessState.lastAnswerStation;
  if (prev && todayLocaStation) {
    const dist = calculateDistance(prev.latitude, prev.longitude, todayLocaStation.latitude, todayLocaStation.longitude);
    const dir = calculateDirection(prev.latitude, prev.longitude, todayLocaStation.latitude, todayLocaStation.longitude);
    
    let regionStatus = "cell-absent";
    if (prev.pref === todayLocaStation.pref) {
      regionStatus = prev.municipality === todayLocaStation.municipality ? "cell-correct" : "cell-present";
    }
    const compStatus = checkArrayMatch(prev.companies, todayLocaStation.companies);
    const lineStatus = checkArrayMatch(prev.lines, todayLocaStation.lines);

    // 履歴に保存（isFreeGuessという専用フラグを立てておきます）
    locaGridHistory.push({
      guess: prev,
      distance: dist + "km",
      distanceNum: dist,
      direction: dir,
      region: regionStatus,
      comp: compStatus,
      line: lineStatus,
      isWin: false,
      isFreeGuess: true 
    });

    // 画面に描画（locaGuessesCount は増えないため、15回の制限枠は減りません）
    renderResultRow(prev, dist, dir, regionStatus, compStatus, lineStatus, false);
    
  }

    // 問題がセットされたら、それが1問目であっても必ず現在の駅と履歴を保存します
    // （これにより、途中で画面を離れても盤面が消えなくなります）
    locaEndlessState.currentStation = todayLocaStation;
    locaEndlessState.history = locaGridHistory;
    localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));

  // 画面表示等のリセット処理
  document.getElementById("station-search-input").value = "";
  document.getElementById("station-search-input").disabled = false;
  document.getElementById("submit-guess-btn").disabled = false;
  
  // スキップボタンの安全ロック判定（残り回数が3回以下の場合は押せなくする）
  const skipBtn = document.getElementById("skip-endless-btn");
  if (skipBtn) {
    skipBtn.disabled = (locaEndlessState.remainingGuesses <= 3);
  }
  
  updateRemainingGuesses();
  
  // 次のタイマー計測の準備
  locaPlayStartTime = null; 

  // スキップボタンの状態を更新
  updateEndlessSkipButton();
}


// ==========================================
// エンドレスモード：スキップボタンの動作
// ==========================================
const skipEndlessBtn = document.getElementById("skip-endless-btn");
if (skipEndlessBtn) {
  skipEndlessBtn.addEventListener("click", () => {
    // 安全装置：残り回数が3回より多い時だけスキップ可能
    if (locaEndlessState.remainingGuesses > 3) {
      
      // コスト3回の支払いと、コンボリセット（ペナルティ）
      locaEndlessState.remainingGuesses -= 3;
      locaEndlessState.combo = 0;

      // コンボが途切れたのでBESTバッジを消す
      updateEndlessBestBadges();
      
      // スキップした駅も「次の問題の0手目ヒント」として利用するために記憶しておく
      locaEndlessState.lastAnswerStation = todayLocaStation;
      
      // セーブして次のラウンド（問題）へ強制移行
      localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));
      
      // コンボ表示を0に戻して次をスタート
      document.getElementById("endless-combo-display").textContent = locaEndlessState.combo;
      startNextEndlessRound();
      
      // スキップ通知を1.5秒間表示
      const skipToast = document.getElementById("skip-toast");
      if (skipToast) {
        skipToast.style.display = "block";
        setTimeout(() => { skipToast.style.display = "none"; }, 1500);
      }
    }
  });
}


// ==========================================
// エンドレス専用：2秒ポップアップと盤面更新
// ==========================================
function showEndlessWinPopup(score, combo, recovery, breakdown) {
  const toast = document.getElementById("endless-toast");

  // タイムボーナスと手数ボーナスの合計（最大15000）だけでプレイヤーの純粋な実力を評価します
  const performanceScore = breakdown.time + breakdown.guess;
  
  // 9段階の厳しい評価メッセージとカラー設定
  let evalText = "CLEAR! 🏁";
  let evalColor = "#9e9e9e";
  
  if (performanceScore >= 15000) { evalText = "GODLIKE!!"; evalColor = "#ffd700"; }
  else if (performanceScore >= 13000) { evalText = "PERFECT!"; evalColor = "#ffb300"; }
  else if (performanceScore >= 11000) { evalText = "AMAZING!"; evalColor = "#fb8c00"; }
  else if (performanceScore >= 9000) { evalText = "EXCELLENT!"; evalColor = "#43a047"; }
  else if (performanceScore >= 7000) { evalText = "BRILLIANT!"; evalColor = "#00acc1"; }
  else if (performanceScore >= 5000) { evalText = "GREAT!"; evalColor = "#1e88e5"; }
  else if (performanceScore >= 3000) { evalText = "GOOD!"; evalColor = "#8e24aa"; }
  else if (performanceScore >= 1000) { evalText = "NICE!"; evalColor = "#e53935"; }

  // 既存のHTML要素にJavaScriptからIDを付け、文字と色を上書きします
  let titleEl = document.getElementById("endless-toast-title");
  if (!titleEl) {
     titleEl = toast.firstElementChild;
     titleEl.id = "endless-toast-title";
  }
  titleEl.textContent = evalText;
  titleEl.style.color = evalColor;

  // 内訳を動的に書き込み
  document.getElementById("endless-toast-breakdown").innerHTML = `
    🎯 基礎スコア: +${breakdown.base}<br>
    ⏱️ タイムボーナス: +${breakdown.time}<br>
    💡 手数ボーナス: +${breakdown.guess}<br>
    🔥 コンボ倍率: ×${breakdown.mult}
  `;
  
  document.getElementById("endless-toast-score").textContent = `+${score} pts`;
  // ★ 浮動小数点バグを確実に防ぐための toFixed(1)
  document.getElementById("endless-toast-combo").textContent = `${combo} Combo! (×${getEndlessComboMultiplier(combo).toFixed(1)})`;
  toast.style.display = "block";

  // 2秒後にポップアップを隠し、シームレスに次の問題の盤面を描画する
  setTimeout(() => {
    toast.style.display = "none";
    
    // 盤面リセットと0手目の自動入力
    startNextEndlessRound();
    
    // スコア表示の更新
    document.getElementById("endless-score-display").textContent = locaEndlessState.score;
    document.getElementById("endless-combo-display").textContent = locaEndlessState.combo;

    // ★ 画面上の「BEST!」バッジを更新
    updateEndlessBestBadges();
    
    // 手数の回復とアニメーション
    if (recovery > 0) {
      locaEndlessState.remainingGuesses += recovery;
      if (locaEndlessState.remainingGuesses > 15) locaEndlessState.remainingGuesses = 15; // 上限15回
      
      updateRemainingGuesses();

      // ★ 回復後にスキップボタンの有効/無効を再判定して復活させる
      updateEndlessSkipButton();
      
      // 残り回数表示の横から「+n」をフワッと浮かび上がらせる
      const anim = document.getElementById("recovery-anim");
      const disp = document.getElementById("remaining-guesses-display");
      if (anim && disp) {
        const rect = disp.getBoundingClientRect();
        // 文字の近く（やや右側）に配置
        anim.style.left = (rect.left + rect.width / 1.5) + "px";
        anim.style.top = (rect.top - 10) + "px";
        anim.textContent = `+${recovery}`;
        anim.style.display = "block";
        
        // CSSアニメーションを一度リセットして再再生する魔法の記述
        anim.classList.remove("anim-float");
        void anim.offsetWidth; 
        anim.classList.add("anim-float");
      }
    }
    
    // 状態をセーブ
    localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));
  }, 2000);
}


// ==========================================
// エンドレスモード：最終ランク判定
// ==========================================
function getEndlessRank(score) {
  // 獲得スコアに応じて、ランクの文字と専用カラーを返します
  // 後半のコンボ倍率インフレを考慮し、最高ランクは1000億に設定しています
  if (score >= 100000000000) return { rank: "SSS+", color: "#ff1744" }; // 1000億
  if (score >= 30000000000) return { rank: "SSS", color: "#f50057" };   // 300億
  if (score >= 10000000000) return { rank: "SSS-", color: "#d500f9" };  // 100億
  if (score >= 5000000000) return { rank: "SS+", color: "#651fff" };    // 50億
  if (score >= 2500000000) return { rank: "SS", color: "#3d5afe" };     // 25億
  if (score >= 1000000000) return { rank: "SS-", color: "#2979ff" };    // 10億
  if (score >= 500000000) return { rank: "S+", color: "#00b0ff" };      // 5億
  if (score >= 300000000) return { rank: "S", color: "#00e5ff" };       // 3億
  if (score >= 150000000) return { rank: "S-", color: "#1de9b6" };      // 1.5億
  if (score >= 80000000) return { rank: "A+", color: "#00e676" };       // 8000万
  if (score >= 50000000) return { rank: "A", color: "#76ff03" };        // 5000万
  if (score >= 30000000) return { rank: "A-", color: "#c6ff00" };       // 3000万
  if (score >= 15000000) return { rank: "B+", color: "#ffea00" };       // 1500万
  if (score >= 8000000) return { rank: "B", color: "#ffc400" };         // 8000万
  if (score >= 3000000) return { rank: "B-", color: "#ff9100" };        // 300万
  if (score >= 1500000) return { rank: "C+", color: "#ff3d00" };        // 150万
  if (score >= 800000) return { rank: "C", color: "#ff8a65" };          // 80万
  if (score >= 300000) return { rank: "C-", color: "#bcaaa4" };         // 30万
  if (score >= 150000) return { rank: "D+", color: "#90a4ae" };         // 15万
  if (score >= 80000) return { rank: "D", color: "#78909c" };           // 8万
  if (score >= 40000) return { rank: "D-", color: "#546e7a" };          // 4万
  return { rank: "E", color: "#37474f" };                               // それ未満
}


// エンドレス専用：ゲームオーバー画面の表示
function showEndlessResultModal() {
  const modal = document.getElementById("endless-result-modal");

  // 記録更新のチェックと「New Record!」の表示
  const isNewScore = locaEndlessState.score > locaEndlessHighScore;
  const isNewCombo = locaEndlessState.maxCombo > locaEndlessMaxComboAllTime;
  
  document.getElementById("endless-result-score-new").style.display = (isNewScore && locaEndlessHighScore > 0) ? "inline-block" : "none";
  document.getElementById("endless-result-combo-new").style.display = (isNewCombo && locaEndlessMaxComboAllTime > 0) ? "inline-block" : "none";

  if (isNewScore) {
    locaEndlessHighScore = locaEndlessState.score;
    localStorage.setItem("ekiLocateEndlessHighScore", locaEndlessHighScore.toString());
  }
  if (isNewCombo) {
    locaEndlessMaxComboAllTime = locaEndlessState.maxCombo;
    localStorage.setItem("ekiLocateEndlessMaxCombo", locaEndlessMaxComboAllTime.toString());
  }

  // HTMLを直接いじらず、JavaScriptからランク表示用の箱を自動生成して差し込みます
  let rankEl = document.getElementById("endless-final-rank");
  if (!rankEl) {
    const scoreContainer = document.getElementById("endless-final-score").parentNode;
    rankEl = document.createElement("div");
    rankEl.id = "endless-final-rank";
    rankEl.style.fontSize = "28px";
    rankEl.style.fontWeight = "900";
    rankEl.style.margin = "10px 0 15px 0";
    scoreContainer.parentNode.insertBefore(rankEl, scoreContainer);
  }
  
  // スコアからランク情報を取得し、色付きで画面に反映させます
  const rankData = getEndlessRank(locaEndlessState.score);
  rankEl.innerHTML = `RANK: <span style="color:${rankData.color}; font-size:42px; text-shadow:0 2px 4px rgba(0,0,0,0.2);">${rankData.rank}</span>`;
  
  document.getElementById("endless-answer-station").textContent = todayLocaStation.kanji;
  document.getElementById("endless-final-score").textContent = locaEndlessState.score;
  document.getElementById("endless-final-combo").textContent = locaEndlessState.maxCombo;
  document.getElementById("endless-final-cleared").textContent = locaEndlessState.clearedCount;
  
  modal.style.display = "flex";
  
  // ゲームオーバーなのでデータをリセットし、次回は最初から遊べるようにする
  locaEndlessState.deck = [];
  locaEndlessState.score = 0;
  locaEndlessState.combo = 0;
  locaEndlessState.maxCombo = 0;
  locaEndlessState.clearedCount = 0;
  locaEndlessState.remainingGuesses = 15;
  locaEndlessState.lastAnswerStation = null;
  localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));
}


// ==========================================
// エンドレスモード：UI連携・演出・リザルト管理
// ==========================================

// 過去の最高記録（ハイスコアと最大連勝数）をローカルストレージから読み込み（なければ0）
let locaEndlessHighScore = parseInt(localStorage.getItem("ekiLocateEndlessHighScore") || "0", 10);
let locaEndlessMaxComboAllTime = parseInt(localStorage.getItem("ekiLocateEndlessMaxCombo") || "0", 10);


// ==========================================
// エンドレスモード：起動時のポップアップ制御
// ==========================================

// ====== [app.js] エンドレスモード起動処理（上書き） ======

// ① ボタンを押した時：先に画面を切り替えてから、履歴の復元を行い、ポップアップを出す
function openEndlessIntroModal() {
  currentDifficulty = 'endless';

  // 1. 先にメインゲーム画面を表示する
  document.getElementById('difficulty-screen').style.display = 'none';
  document.getElementById('main-game-screen').style.display = 'block';
  
  const topBackBtn = document.getElementById('top-back-btn');
  if (topBackBtn) topBackBtn.style.display = 'inline-flex';
  const remainDisplay = document.getElementById('remaining-guesses-display');
  if (remainDisplay) remainDisplay.style.display = 'block';

  const badge = document.getElementById("hard-mode-badge");
  if (badge) badge.style.display = 'none';

  document.getElementById("endless-status-bar").style.display = "flex";
  document.getElementById("endless-score-display").textContent = locaEndlessState.score;
  document.getElementById("endless-combo-display").textContent = locaEndlessState.combo;

  // 2. プレイ途中の履歴があれば盤面を復元し、なければ新しい問題をセットする
  if (locaEndlessState.currentStation && locaEndlessState.history && locaEndlessState.history.length > 0) {
    todayLocaStation = locaEndlessState.currentStation;
    locaGridHistory = locaEndlessState.history;
    // 0手目（ボーナス）を除いた実質の手数を計算
    locaGuessesCount = locaGridHistory.filter(h => !h.isFreeGuess).length; 
    
    document.getElementById("results-tbody").innerHTML = "";
    locaGridHistory.forEach(h => {
      renderResultRow(h.guess, h.distanceNum, h.direction, h.region, h.comp, h.line, h.isWin);
    });
    updateRemainingGuesses();
    updateEndlessSkipButton(); // スキップボタンの状態を更新
  } else {
    startNextEndlessRound();
  }

  // 3. 入力欄をロックした上で、説明ポップアップを表示する
  document.getElementById("station-search-input").disabled = true;
  document.getElementById("submit-guess-btn").disabled = true;
  document.getElementById("endless-intro-modal").style.display = "flex";
}

// ② ポップアップのボタンを押した時：入力を解放してゲームをスタート
function closeEndlessIntroAndStart() {
  document.getElementById("endless-intro-modal").style.display = "none";
  document.getElementById("station-search-input").disabled = false;
  document.getElementById("submit-guess-btn").disabled = false;
  locaPlayStartTime = null; // タイマーリセット
}

// ③ 「もう一度プレイ」ボタン用の直接リスタート関数
function restartEndlessMode() {
  document.getElementById("endless-result-modal").style.display = "none";
  // データは showEndlessResultModal 内で初期化済みなので、次のラウンドを呼ぶだけ
  startNextEndlessRound();
}
// ③ ハイスコア更新時にリアルタイムで派手な演出を出す関数
function checkAndTriggerHighScoreEffect(currentScore) {
  // 今のスコアが過去のハイスコアを上回った瞬間の判定
  if (currentScore > locaEndlessHighScore && locaEndlessHighScore > 0) {
    const hsToast = document.getElementById("endless-highscore-toast");
    if (hsToast && hsToast.style.display === "none") {
      // 画面上部にピカピカ光るハイスコア通知を3秒間だけ表示する演出
      hsToast.style.display = "block";
      setTimeout(() => {
        hsToast.style.display = "none";
      }, 3000);
      
      // 何度も演出が出ないように、リアルタイムでハイスコア値を仮更新しておく
      locaEndlessHighScore = currentScore;
      localStorage.setItem("ekiLocateEndlessHighScore", locaEndlessHighScore.toString());
    }
  }
}

// ④ 【差し替え・機能拡張】エンドレスモード終了時の専用ウィンドウ表示
function showEndlessResultModal() {
  const modal = document.getElementById("endless-result-modal");
  
  // 今回のスコアが最終的にハイスコアを更新したかチェックして保存
  if (locaEndlessState.score > locaEndlessHighScore) {
    locaEndlessHighScore = locaEndlessState.score;
    localStorage.setItem("ekiLocateEndlessHighScore", locaEndlessHighScore.toString());
  }
  if (locaEndlessState.maxCombo > locaEndlessMaxComboAllTime) {
    locaEndlessMaxComboAllTime = locaEndlessState.maxCombo;
    localStorage.setItem("ekiLocateEndlessMaxCombo", locaEndlessMaxComboAllTime.toString());
  }

  // 専用結果ウィンドウのテキストを書き換える
  document.getElementById("endless-answer-station").textContent = todayLocaStation.kanji;
  document.getElementById("endless-final-score").textContent = locaEndlessState.score;
  document.getElementById("endless-final-combo").textContent = locaEndlessState.maxCombo;
  document.getElementById("endless-final-cleared").textContent = locaEndlessState.clearedCount;

  // ウィンドウ内に過去の最高連勝、過去の最高スコアを動的に追加
  const recordDiv = document.createElement("div");
  recordDiv.style.marginTop = "15px";
  recordDiv.style.fontSize = "13px";
  recordDiv.style.color = "#7f8c8d";
  recordDiv.style.fontWeight = "bold";
  recordDiv.innerHTML = `
    <div>🏆 過去最高スコア: ${locaEndlessHighScore} pts</div>
    <div>🔥 過去最高連勝数: ${locaEndlessMaxComboAllTime} 連勝</div>
  `;
  
  // アフィリエイトPR枠の作成（スクロールのズレを防ぐため高さを固定確保）
  // 修正後：PRバッジを最上部に置き、全パターン＆両ショップのリンクを完全生成して敷き詰めた決定版です
  const affDiv = document.createElement("div");
  affDiv.style.margin = "20px 15px"; // 【変更】上下に20px、左右に15pxの余白を持たせる
  affDiv.style.padding = "15px";
  affDiv.style.background = "#fafafa";
  affDiv.style.borderRadius = "8px";
  affDiv.style.border = "1px solid #e2e8f0";
  affDiv.style.textAlign = "left";
  affDiv.style.minHeight = "280px";
  
  // 内部のHTML文字列の中の「PRバッジ」の行を以下のように修正します
  // 【変更】justify-content:center; を追加してPRの文字を真ん中にします
  affDiv.innerHTML = `
    <div style="margin-bottom:12px; display:flex; justify-content:center; align-items:center;">
        <span style="font-size:10px; color:#94a3b8; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-weight:bold; letter-spacing:1px; background:#fff;">PR</span>
    </div>

    <div style="font-size:12px; color:#475569; font-weight:bold; margin-bottom:12px; text-align:center;">
        💻 じっくり楽しんだ目と脳に、最高のご褒美とリフレッシュを。
    </div>

    <div style="margin-bottom:12px; border-bottom:1px dashed #e2e8f0; padding-bottom:10px;">
        <div style="font-size:11px; color:#64748b; font-weight:bold; margin-bottom:4px;">👁️ 画面をじっと見つめ続けた目元をじんわり温める</div>
        <div style="display:flex; gap:6px;">
            <a href="//af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F%25E3%2583%25A1%25E3%2582%25B0%25E3%2583%25AA%25E3%2582%25BA%25E3%2583%25A0%2F" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#bf0000; background:#fff5f5; border:1px solid #feb2b2; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                楽天市場
            </a>
            <a href="//af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=https%3A%2F%2Fshopping.yahoo.co.jp%2Fsearch%3Fp%3D%25E3%2583%25A1%25E3%2582%25B0%25E3%2583%25AA%25E3%2582%25BA%25E3%2583%25A0" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#ff007f; background:#fff5fa; border:1px solid #fbb6ce; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                Yahoo!
            </a>
        </div>
        <img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">
        <img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">
    </div>

    <div style="margin-bottom:12px; border-bottom:1px dashed #e2e8f0; padding-bottom:10px;">
        <div style="font-size:11px; color:#64748b; font-weight:bold; margin-bottom:4px;">🍬 集中して消耗したブドウ糖を美味しくチャージ</div>
        <div style="display:flex; gap:6px;">
            <a href="//af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F%25E5%25A4%25A7%25E7%25B2%2592%25E3%2583%25A9%25E3%2583%25A0%25E3%2583%258D%2F" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#bf0000; background:#fff5f5; border:1px solid #feb2b2; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                楽天市場
            </a>
            <a href="//af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=https%3A%2F%2Fshopping.yahoo.co.jp%2Fsearch%2F%25E5%25A4%25A7%25E7%25B2%2592%25E3%2583%25A9%25E3%2583%25A0%25E3%2583%258D%2F0%2F%3Ffirst%3D1%26tab_ex%3Dcommerce%26fr%3Dshp-prop%26mcr%3D0d82602f670f66d79b8f3e6db110de22%26ts%3D1781342120%26sretry%3D1%26sc_i%3Dshopping-pc-web-search-suggest-h_srch-srchbtn-sgstfrom-top--h_srch-kwd%26area%3D13" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#ff007f; background:#fff5fa; border:1px solid #fbb6ce; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                Yahoo!
            </a>
        </div>
        <img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">
        <img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">
    </div>

    <div style="margin-bottom:12px; border-bottom:1px dashed #e2e8f0; padding-bottom:10px;">
        <div style="font-size:11px; color:#64748b; font-weight:bold; margin-bottom:4px;">🍫 とろける甘さでホッと一息、自分へのご褒美に</div>
        <div style="display:flex; gap:6px;">
            <a href="//af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F%25E3%2583%25AA%25E3%2583%25B3%25E3%2583%25B4%2B%25E3%2583%2581%25E3%2583%25A7%25E3%2582%25B3%25E3%2583%25AC%25E3%2583%25BC%25E3%2583%2588%2F" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#bf0000; background:#fff5f5; border:1px solid #feb2b2; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                楽天市場
            </a>
            <a href="//af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=https%3A%2F%2Fshopping.yahoo.co.jp%2Fsearch%3Fp%3D%25E3%2583%25AA%25E3%2583%25B3%25E3%2583%25B4%252B%25E3%2583%2581%25E3%2583%25A7%25E3%2582%25B3%25E3%2583%25AC%25E3%2583%25BC%25E3%2583%2588" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#ff007f; background:#fff5fa; border:1px solid #fbb6ce; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                Yahoo!
            </a>
        </div>
        <img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">
        <img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">
    </div>

    <div>
        <div style="font-size:11px; color:#64748b; font-weight:bold; margin-bottom:4px;">🗺️ 次はゲームを離れて、のんびり日本全国を眺めてみる？</div>
        <div style="display:flex; gap:6px;">
            <a href="//af.moshimo.com/af/c/click?a_id=5616620&p_id=54&pc_id=54&pl_id=616&url=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F%25E6%2597%25A5%25E6%259C%25AC%25E9%2589%2584%25E9%2581%2593%25E6%2597%2585%25E8%25A1%258C%25E5%259C%25B0%25E5%259B%25B3%25E5%25B8%25B3%2F" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#bf0000; background:#fff5f5; border:1px solid #feb2b2; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                楽天市場
            </a>
            <a href="//af.moshimo.com/af/c/click?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502&url=https%3A%2F%2Fshopping.yahoo.co.jp%2Fsearch%3Fp%3D%25E6%2597%25A5%25E6%259C%25AC%25E9%2589%2584%25E9%2581%2593%25E6%2597%2585%25E8%25A1%258C%25E5%259C%25B0%25E5%259B%25B3%25E5%25B8%25B3" rel="nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc style="flex:1; text-align:center; font-size:11px; color:#ff007f; background:#fff5fa; border:1px solid #fbb6ce; padding:5px 0; border-radius:4px; text-decoration:none; font-weight:bold;">
                Yahoo!
            </a>
        </div>
        <img src="//i.moshimo.com/af/i/impression?a_id=5616620&p_id=54&pc_id=54&pl_id=616" width="1" height="1" style="border:none;" alt="" loading="lazy">
        <img src="//i.moshimo.com/af/i/impression?a_id=5626583&p_id=1225&pc_id=1925&pl_id=18502" width="1" height="1" style="border:none;" alt="" loading="lazy">
    </div>
  `;

  // モード選択に戻る際、ステータスバーを綺麗に隠す処理をボタンに仕込む
  const modalContent = modal.querySelector(".modal-content");
  // 過去の重複追加を防ぐため、一度追加用のクラスを掃除してから挿入します
  const oldBoxes = modalContent.querySelectorAll(".endless-add-box");
  oldBoxes.forEach(b => b.remove());
  
  recordDiv.classList.add("endless-add-box");
  affDiv.classList.add("endless-add-box");
  
  // 【修正後：用意しておいた安全な専用エリアに差し込みます】
  const dynamicArea = document.getElementById("endless-dynamic-content-area");
  if (dynamicArea) {
    dynamicArea.innerHTML = ""; // 過去の要素をクリア
    dynamicArea.appendChild(recordDiv);
    dynamicArea.appendChild(affDiv);
  }

  modal.style.display = "flex";

  // ゲームオーバーになったので次回のために現在のプレイデータをリセット
  locaEndlessState = {
    deck: [], score: 0, combo: 0, maxCombo: 0, clearedCount: 0, remainingGuesses: 15, lastAnswerStation: null
  };
  localStorage.setItem("ekiLocateEndlessDeck", JSON.stringify(locaEndlessState));
}


// ==========================================
// エンドレスモード：追加機能群（バッジ・シェア・終了）
// ==========================================

// リアルタイムでステータスバーに「BEST!」バッジを表示する関数
function updateEndlessBestBadges() {
  const sBadge = document.getElementById("badge-score-best");
  const cBadge = document.getElementById("badge-combo-best");
  if (sBadge) sBadge.style.display = (locaEndlessState.score > locaEndlessHighScore && locaEndlessHighScore > 0) ? "inline-block" : "none";
  if (cBadge) cBadge.style.display = (locaEndlessState.combo > locaEndlessMaxComboAllTime && locaEndlessMaxComboAllTime > 0) ? "inline-block" : "none";
}

// 終了（ギブアップ）ボタンの処理
const giveupBtn = document.getElementById("giveup-endless-btn");
if (giveupBtn) {
  giveupBtn.addEventListener("click", () => {
    if (confirm("サバイバルを終了して結果を見ますか？\n（現在のスコアは記録されます）")) {
       showEndlessResultModal();
    }
  });
}

// 結果画面から「モード選択」に戻る処理
function returnToDiffScreenFromEndless() {
  document.getElementById("endless-result-modal").style.display = "none";
  document.getElementById("main-game-screen").style.display = "none";
  document.getElementById("difficulty-screen").style.display = "block";
  
  const badge = document.getElementById("hard-mode-badge");
  if (badge) badge.style.display = "none";
  const topBackBtn = document.getElementById("top-back-btn");
  if (topBackBtn) topBackBtn.style.display = "none";
  const remainDisplay = document.getElementById('remaining-guesses-display');
  if (remainDisplay) remainDisplay.style.display = 'none';
  const endlessBar = document.getElementById("endless-status-bar");
  if (endlessBar) endlessBar.style.display = "none";
}

// 戻るボタン・×ボタンへの紐付け
document.getElementById("endless-back-title-btn")?.addEventListener("click", returnToDiffScreenFromEndless);
document.getElementById("close-endless-result-btn")?.addEventListener("click", returnToDiffScreenFromEndless);

// エンドレスモード専用のシェア機能
function shareEndlessResult(type) {
  const currentUrl = window.location.href.split('?')[0];
  let text = `駅ロケ エンドレスモード\n`;
  text += `🏆 最終スコア: ${document.getElementById("endless-final-score").textContent} pts\n`;
  text += `🔥 最高連勝: ${document.getElementById("endless-final-combo").textContent} 連勝\n`;
  text += `📍 到達駅数: ${document.getElementById("endless-final-cleared").textContent} 駅\n\n`;
  text += `#駅ロケ\n#駅ロケエンドレス\n${currentUrl}`;

  if (type === "twitter") {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  } else if (type === "line") {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
  } else if (type === "facebook") {
    // Facebookのシェア画面を開きます
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}&quote=${encodeURIComponent(text)}`, "_blank");
  } else if (type === "copy") {
    // テキストをコピーします
    navigator.clipboard.writeText(text).then(() => alert("クリップボードにコピーしました"));
  }
}

// 各シェアボタンが押された時の動作を紐付けます
document.getElementById("endless-share-btn")?.addEventListener("click", () => shareEndlessResult("twitter"));
document.getElementById("endless-line-btn")?.addEventListener("click", () => shareEndlessResult("line"));
document.getElementById("endless-fb-btn")?.addEventListener("click", () => shareEndlessResult("facebook"));
document.getElementById("endless-copy-btn")?.addEventListener("click", () => shareEndlessResult("copy"));


// ==========================================
// 総合成績（全モードのプレイ記録）の表示処理
// ==========================================
function showAllStats() {
  try {
    // セーブデータを安全に読み込みます（データが無い場合は空の数値を入れます）
    const statsData = JSON.parse(localStorage.getItem("ekiLocateStatsV2")) || {};
    const n = statsData.normal || {played:0, won:0, currentStreak:0, maxStreak:0};
    const h = statsData.hard || {played:0, won:0, currentStreak:0, maxStreak:0};
    
    // エンドレスのスコアもエラーを防ぐためローカルストレージから直接取得します
    const eScore = parseInt(localStorage.getItem("ekiLocateEndlessHighScore")) || 0;
    const eCombo = parseInt(localStorage.getItem("ekiLocateEndlessMaxCombo")) || 0;

    // 取得した数値を各項目に書き込みます（要素が存在するかどうかも確認します）
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setSafeText("st-n-play", n.played);
    setSafeText("st-n-win", n.played > 0 ? Math.round((n.won / n.played) * 100) : 0);
    setSafeText("st-n-streak", n.currentStreak);
    setSafeText("st-n-max", n.maxStreak);

    setSafeText("st-h-play", h.played);
    setSafeText("st-h-win", h.played > 0 ? Math.round((h.won / h.played) * 100) : 0);
    setSafeText("st-h-streak", h.currentStreak);
    setSafeText("st-h-max", h.maxStreak);

    setSafeText("st-e-score", eScore);
    setSafeText("st-e-combo", eCombo);

    // 画面を表示します
    const modalEl = document.getElementById("all-stats-modal");
    if (modalEl) {
      modalEl.style.display = "flex";
    } else {
      alert("成績画面が見つかりません。index.htmlの追加場所をご確認ください。");
    }
  } catch (error) {
    console.error("成績表示エラー:", error);
    alert("データの読み込みに失敗しました。");
  }
}

// モード選択画面のボタンから呼び出す
document.getElementById("show-stats-btn")?.addEventListener("click", showAllStats);

// サイドメニューのボタンから呼び出す（メニューを閉じてから表示）
document.getElementById("side-stats-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  const sideMenu = document.getElementById("side-menu");
  const overlay = document.getElementById("side-menu-overlay");
  if(sideMenu) sideMenu.style.right = "-250px";
  if(overlay) setTimeout(() => overlay.style.display = "none", 300);
  showAllStats();
});

// タブの切り替えアニメーション（通常/Hard ⇔ サバイバル）
document.getElementById("tab-normal")?.addEventListener("click", (e) => {
  e.target.style.background = "#3498db"; e.target.style.color = "#fff";
  const tEnd = document.getElementById("tab-endless");
  if(tEnd) { tEnd.style.background = "#fff"; tEnd.style.color = "#3498db"; }
  document.getElementById("stats-view-normal").style.display = "block";
  document.getElementById("stats-view-endless").style.display = "none";
});

document.getElementById("tab-endless")?.addEventListener("click", (e) => {
  e.target.style.background = "#3498db"; e.target.style.color = "#fff";
  const tNorm = document.getElementById("tab-normal");
  if(tNorm) { tNorm.style.background = "#fff"; tNorm.style.color = "#3498db"; }
  document.getElementById("stats-view-endless").style.display = "block";
  document.getElementById("stats-view-normal").style.display = "none";
});


// 画面の準備ができたらゲームスタート
window.addEventListener("DOMContentLoaded", initLocaGame);
