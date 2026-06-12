import json
import hashlib
import os
from datetime import datetime, timedelta, timezone
import requests

SECRET_SALT = "EkiDoru_Secret_2026!"

def math_imul(a, b):
    return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff

def zero_fill_right_shift(val, n):
    return (val % 0x100000000) >> n

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

    # 後でファイルに書き込むためのデータを一時保存する箱
    generated_hashes = {}
    generated_admin = {}

    # 【修正点1】文字数モードごとに、0日目から未来まで一貫してシミュレーションを行う
    for mode in [4, 5, 6]:
        mode_stations = [s for s in stations if len(s['yomi']) == mode]
        if not mode_stations: continue

        unique_yomi_count = len(set([s['yomi'] for s in mode_stations]))
        lookback = min(1000, int(unique_yomi_count * 0.7))
        next_available_day = {}

        # 0日目から、今日＋14日後までを通してループさせる
        for d in range(0, today_index + 15):
            
            # 【完全再現2】startDay / endDay の未定義（None）判定をJSの挙動と厳密に合わせる
            active_stations = []
            for s in mode_stations:
                s_start = s.get('startDay')
                s_end = s.get('endDay')
                
                # JS側では startDay が undefined の駅は評価が false になり除外される
                if s_start is None or s_start > d:
                    continue
                
                # JS側では endDay が undefined、またはdより大きい、または999999の駅が現役扱い
                if s_end is None or s_end > d or s_end == 999999:
                    active_stations.append(s)
                    
            if not active_stations:
                active_stations = mode_stations

            # ロック期間中ではない駅を絞り込む
            pool = [s for s in active_stations if next_available_day.get(s['yomi'], 0) <= d]
            if not pool:
                pool = active_stations

            # シード計算と駅の抽出
            seed = d * 12345 + mode * 6789
            hash_val = math_imul(seed ^ zero_fill_right_shift(seed, 15), 2246822507)
            hash_val = math_imul(hash_val ^ zero_fill_right_shift(hash_val, 13), 3266489909)
            hash_val = zero_fill_right_shift(hash_val ^ zero_fill_right_shift(hash_val, 16), 0)
            
            candidate = pool[hash_val % len(pool)]
            
            # 次回出禁日をセットする（これによりシミュレーションの辻褄が合う）
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

    # ---------------------------------------------------------
    # 最後に、生成された15日分のデータを各ファイルに書き込む処理
    # ---------------------------------------------------------
    # ファイルへの書き込み処理
    for d in range(today_index, today_index + 15):
        target_date = base_date + timedelta(days=d)
        year_str = str(target_date.year)
        date_str = target_date.strftime('%Y-%m-%d')
        
        filepath_hash = f'answers/{year_str}.json'
        filepath_admin = f'answers_admin/{year_str}_admin.json'

        # 本番用（ハッシュ）ファイルの更新
        existing_hashes = {}
        if os.path.exists(filepath_hash):
            with open(filepath_hash, 'r', encoding='utf-8') as f:
                existing_hashes = json.load(f)
                
        # 【対処法】ここが重要ポイント
        # d が「今日より3日後」以前の場合は、すでにデータがあれば絶対に上書きしない（プレイ中の通信エラーを防ぐため）
        if d <= today_index + 3:
            if date_str not in existing_hashes:
                existing_hashes[date_str] = generated_hashes[date_str]
        else:
            # d が4日後以降の場合は、常に最新の駅データに基づいた答えで強制上書きする
            existing_hashes[date_str] = generated_hashes[date_str]

        with open(filepath_hash, 'w', encoding='utf-8') as f:
            json.dump(existing_hashes, f, ensure_ascii=False, separators=(',', ':'))

        # 管理者用（平文）ファイルの更新（こちらも同様のロジックを適用）
        existing_admin = {}
        if os.path.exists(filepath_admin):
            with open(filepath_admin, 'r', encoding='utf-8') as f:
                existing_admin = json.load(f)
                
        if d <= today_index + 3:
            if date_str not in existing_admin:
                existing_admin[date_str] = generated_admin[date_str]
        else:
            existing_admin[date_str] = generated_admin[date_str]

        with open(filepath_admin, 'w', encoding='utf-8') as f:
            json.dump(existing_admin, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    generate_answers()
