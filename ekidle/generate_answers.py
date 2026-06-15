import json
import hashlib
import os
from datetime import datetime, timedelta, timezone
import requests

SECRET_SALT = "EkiDoru_Secret_2026!"
STATE_FILE = "state.json"

def math_imul(a, b):
    return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff

def zero_fill_right_shift(val, n):
    return (val & 0xffffffff) >> n

def generate_answers():
    # 1. 最新の駅データをインターネット経由で直接読み込む
    # stations_url = "https://eki-puzzle.pages.dev/ekidle/" # ←★ここに実際のstations.jsonのURLを入れます
    try:
        with open('../stations.json', 'r', encoding='utf-8') as f:
            raw_stations = json.load(f)
    
    # try:
        # response = requests.get(stations_url, timeout=10)
        # response.raise_for_status() # 通信エラーがないかチェック
        # raw_stations = response.json()
    except Exception as e:
        print(f"駅データの取得に失敗しました: {e}")
        return # 取得失敗時は安全のため処理を中止する

    # JS側と同じ「貨物専用駅の除外ロジック」を適用し、配列の数と順序を完全に一致させる
    stations = []
    for s in raw_stations:
        companies = s.get('companies', [])
        if companies and len(companies) == 1 and companies[0] == "日本貨物鉄道":
            continue
            
        # 【強化版フィルター】都道府県、事業者、住所、営業キロのいずれかが欠けているゴースト駅を除外
        if not s.get('pref') or not companies or not s.get('address') or s.get('min_km') is None:
            continue
            
        stations.append(s)
    
    base_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    now_jst = datetime.now(timezone(timedelta(hours=9)))
    today_index = (now_jst.date() - base_date.date()).days

    # 本番用と管理者用のフォルダをそれぞれ用意する
    os.makedirs('answers', exist_ok=True)
    os.makedirs('answers_admin', exist_ok=True)

    # ---------------------------------------------------------
    # 【追加】状態 (state.json) の読み込み
    # ---------------------------------------------------------
    app_state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                app_state = json.load(f)
                print("state.json を読み込みました。差分のみ計算します。")
        except Exception as e:
            print(f"state.json の読み込みに失敗しました。0日目から再計算します: {e}")
            app_state = {}

    # 計算が必要な最終日（今日から43日後まで担保する）
    target_day = today_index + 43

    # 後でファイルに書き込むためのデータを一時保存する箱
    generated_hashes = {}
    generated_admin = {}

    # 文字数モードごとに、0日目から未来まで一貫してシミュレーションを行う
    for mode in [4, 5, 6]:
        mode_stations = [s for s in stations if len(s['yomi']) == mode]
        if not mode_stations: continue

        unique_yomi_count = len(set([s['yomi'] for s in mode_stations]))
        lookback = min(1000, int(unique_yomi_count * 0.7))
        
        # state.json から前回の続きを取得（なければ初期値）
        mode_state = app_state.get(mode_str, {})
        last_calculated_day = mode_state.get("last_calculated_day", -1)
        next_available_day = mode_state.get("next_available_day", {})

        # もし既に十分な未来まで計算済みなら、この文字数モードはスキップ
        if last_calculated_day >= target_day:
            continue

        # 前回の続き（または0日目）から計算スタート
        start_day = last_calculated_day + 1

        # --- 高速化・完全一致のためのキュー準備 ---
        for s in mode_stations:
            s['is_active'] = (s.get('startDay') is None)

        arrival_queue = sorted([s for s in mode_stations if s.get('startDay') is not None], key=lambda x: x['startDay'])
        departure_queue = sorted([s for s in mode_stations if s.get('endDay') is not None and s.get('endDay') != 999999], key=lambda x: x['endDay'])
        
        arr_idx, dep_idx = 0, 0

        # start_day までの状態を早送り
        for d in range(0, start_day):
            while arr_idx < len(arrival_queue) and arrival_queue[arr_idx]['startDay'] <= d:
                arrival_queue[arr_idx]['is_active'] = True
                arr_idx += 1
            while dep_idx < len(departure_queue) and departure_queue[dep_idx]['endDay'] <= d:
                departure_queue[dep_idx]['is_active'] = False
                dep_idx += 1
        
        # --- メインシミュレーションループ ---
        for d in range(start_day, target_day + 1):
            
            while arr_idx < len(arrival_queue) and arrival_queue[arr_idx]['startDay'] <= d:
                arrival_queue[arr_idx]['is_active'] = True
                arr_idx += 1
            while dep_idx < len(departure_queue) and departure_queue[dep_idx]['endDay'] <= d:
                departure_queue[dep_idx]['is_active'] = False
                dep_idx += 1

            # 元の並び順のままフィルタリング
            pool = [s for s in mode_stations if s['is_active'] and next_available_day.get(s['yomi'], 0) <= d]
            if not pool:
                pool = [s for s in mode_stations if s['is_active']]

            # シード計算と駅の抽出
            seed = d * 12345 + mode * 6789
            hash_val = math_imul(seed ^ zero_fill_right_shift(seed, 15), 2246822507)
            hash_val = math_imul(hash_val ^ zero_fill_right_shift(hash_val, 13), 3266489909)
            hash_val = zero_fill_right_shift(hash_val ^ zero_fill_right_shift(hash_val, 16), 0)
            
            candidate = pool[hash_val % len(pool)]
            
            # 次回出禁日をセットする
            next_available_day[candidate['yomi']] = d + lookback + 1

            # 【重要】0日目から計算はするが、保存するのは「今日から15日後」の分だけ
            if d >= today_index:
                target_date = base_date + timedelta(days=d)
                date_str = target_date.strftime('%Y-%m-%d')
                
                salted_text = SECRET_SALT + candidate['yomi']
                hashed_text = hashlib.sha256(salted_text.encode('utf-8')).hexdigest()
                
                if date_str not in generated_hashes:
                    generated_hashes[date_str] = {}
                    generated_admin[date_str] = {}
                
                # 暗号化された本番用データ
                generated_hashes[date_str][str(mode)] = hashed_text
                
                # 管理者が確認するための平文データ
                generated_admin[date_str][str(mode)] = {
                    "kanji": candidate['kanji'],
                    "yomi": candidate['yomi']
                }

        # この文字数モードの状態を更新
        app_state[mode_str] = {
            "last_calculated_day": target_day,
            "next_available_day": next_available_day
        }

    # ---------------------------------------------------------
    # 最後に、生成された43日分のデータを各ファイルに書き込む処理
    # ---------------------------------------------------------
    
    # 【軽量化版】ファイルを何度も開閉せず、キャッシュを利用して一括処理する
    cache_hashes = {}
    cache_admin = {}
    
    # date_strから「何日目(d)」かを逆算して保護判定に使う
   for date_str, modes_data in generated_hashes.items():
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        d_current = (date_obj.date() - base_date.date()).days
        year_str = str(date_obj.year)
        
        filepath_hash = f'answers/{year_str}.json'
        filepath_admin = f'answers_admin/{year_str}_admin.json'

    # キャッシュになければ、ファイルから読み込む（初回のみ実行される）
    if filepath_hash not in cache_hashes:
        if os.path.exists(filepath_hash):
            with open(filepath_hash, 'r', encoding='utf-8') as f:
                cache_hashes[filepath_hash] = json.load(f)
        else:
            cache_hashes[filepath_hash] = {}
                
    if filepath_admin not in cache_admin:
        if os.path.exists(filepath_admin):
            with open(filepath_admin, 'r', encoding='utf-8') as f:
                cache_admin[filepath_admin] = json.load(f)
        else:
            cache_admin[filepath_admin] = {}

    # ---------------------------------------------------------
    # 【重要】保護ロジック：今日から3日後までは上書きしない
    # ---------------------------------------------------------
    if date_str not in cache_hashes[filepath_hash]:
        cache_hashes[filepath_hash][date_str] = {}
    if date_str not in cache_admin[filepath_admin]:
        cache_admin[filepath_admin][date_str] = {}
            
    is_protected = (d_current <= today_index + 3)

    for mode_str, hashed_text in modes_data.items():
        # 保護対象期間で、かつ既にJSON内に答えが書き込み済みの場合はスキップ
        if is_protected and mode_str in cache_hashes[filepath_hash][date_str]:
            # ※管理者用も同様にスキップ
            continue
            
            # それ以外（保護期間外、またはJSONにまだ存在しない新規データ）なら書き込む
            cache_hashes[filepath_hash][date_str][mode_str] = hashed_text
            cache_admin[filepath_admin][date_str][mode_str] = generated_admin[date_str][mode_str]
            
    # ループが終わった後、更新されたデータを1回だけファイルに書き込む
    for filepath, data in cache_hashes.items():
        with open(filepath, 'w', encoding='utf-8') as f:
            sorted_data = dict(sorted(data.items()))                    # 日付キーでソートして保存するとファイルが綺麗に保たれます
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    for filepath, data in cache_admin.items():
        with open(filepath, 'w', encoding='utf-8') as f:
            sorted_data = dict(sorted(data.items()))
            json.dump(data, f, ensure_ascii=False, indent=4)

    # 最後に state.json を保存
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(app_state, f, ensure_ascii=False)
    print("処理が完了し、状態を保存しました。")

if __name__ == "__main__":
    generate_answers()
