import json
import hashlib
import os
from datetime import datetime, timedelta, timezone

# JS側と完全に一致させるための暗号化キー
SECRET_SALT = "EkiLocate_Secret_2026!"

# JavaScriptの Math.imul と全く同じビット演算を行う関数
def math_imul(a, b):
    return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff

def zero_fill_right_shift(val, n):
    return (val % 0x100000000) >> n

# 座標（またはURL）から同一駅判定用のキーを作る関数
def get_coord_key(s):
    lat = s.get('latitude')
    lon = s.get('longitude')
    if lat is not None and lon is not None:
        return f"{lat},{lon}"
    return s.get('url', 'unknown')

def generate_answers():
    try:
        with open('../stations.json', 'r', encoding='utf-8') as f:
            raw_stations = json.load(f)
    except Exception as e:
        print(f"駅データの取得に失敗しました: {e}")
        return

    base_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    now_jst = datetime.now(timezone(timedelta(hours=9)))
    today_index = (now_jst.date() - base_date.date()).days

    os.makedirs('answers', exist_ok=True)
    os.makedirs('answers_admin', exist_ok=True)

    generated_hashes = {}
    generated_admin = {}

    # ==============================================================
    # 修正版：未来の「その日（target_d）」のJS環境を完全に再現するシミュレーション
    # ==============================================================
    # 今日から36日分（約1ヶ月後まで）の答えを生成します
    for target_d in range(today_index, today_index + 36):
        
        # 1. ターゲット日（その日）の視点で、JSの locaStations と validStations を作る
        valid_stations = []
        for s in raw_stations:
            companies = s.get('companies', [])
            
            # initLocaGame と同等のフィルタ
            if s.get('latitude') is None or s.get('longitude') is None:
                continue
            if len(companies) == 1 and companies[0] == "日本貨物鉄道":
                continue
            if s.get('startDay') is not None and s.get('startDay') > target_d:
                continue
            if s.get('endDay') is not None and s.get('endDay') != 999999 and s.get('endDay') <= target_d - 33:
                continue
                
            # selectTodayLocaStation と同等のフィルタ
            if not s.get('pref') or not s.get('address') or s.get('min_km') is None or not companies:
                continue
                
            valid_stations.append(s)

        lookback = 1000
        next_available_day = {}
        candidate_normal = None
        candidate_hard = None

        # 2. ターゲット日の配列を使って、0日からターゲット日まで歴史をシミュレーション
        for d in range(0, target_d + 1):
            pool_normal = []
            pool_hard = []
            
            for s in valid_stations:
                if s.get('startDay') is not None and s.get('startDay') > d:
                    continue
                if s.get('endDay') is not None and s.get('endDay') <= d and s.get('endDay') != 999999:
                    continue
                
                c_key = get_coord_key(s)
                if next_available_day.get(c_key, 0) > d:
                    continue
                
                pool_normal.append(s)
                pool_hard.append(s)
                
            if not pool_normal:
                pool_normal = list(valid_stations)
                pool_hard = list(valid_stations)

            # 通常モードの抽選
            seed_n = d * 33333 + 54321
            hash_n = math_imul(seed_n ^ zero_fill_right_shift(seed_n, 15), 2246822507)
            hash_n = math_imul(hash_n ^ zero_fill_right_shift(hash_n, 13), 3266489909)
            hash_n = zero_fill_right_shift(hash_n ^ zero_fill_right_shift(hash_n, 16), 0)

            candidate_normal = pool_normal[hash_n % len(pool_normal)]
            next_available_day[get_coord_key(candidate_normal)] = d + lookback + 1

            # ハードモードの抽選
            normal_key = get_coord_key(candidate_normal)
            pool_hard = [s for s in pool_hard if get_coord_key(s) != normal_key]
            
            if not pool_hard:
                pool_hard = list(valid_stations)

            seed_h = d * 33333 + 99999
            hash_h = math_imul(seed_h ^ zero_fill_right_shift(seed_h, 15), 2246822507)
            hash_h = math_imul(hash_h ^ zero_fill_right_shift(hash_h, 13), 3266489909)
            hash_h = zero_fill_right_shift(hash_h ^ zero_fill_right_shift(hash_h, 16), 0)

            candidate_hard = pool_hard[hash_h % len(pool_hard)]
            next_available_day[get_coord_key(candidate_hard)] = d + lookback + 1
            
            # シミュレーションがターゲット日に到達したら結果を確定
            if d == target_d:
                final_normal = candidate_normal
                final_hard = candidate_hard

        # 3. 確定した結果を記録
        target_date = base_date + timedelta(days=target_d)
        date_str = target_date.strftime('%Y-%m-%d')
        
        n_hashed = hashlib.sha256((SECRET_SALT + final_normal['kanji']).encode('utf-8')).hexdigest()
        h_hashed = hashlib.sha256((SECRET_SALT + final_hard['kanji']).encode('utf-8')).hexdigest()
        
        generated_hashes[date_str] = {'normal': n_hashed, 'hard': h_hashed}
        generated_admin[date_str] = {
            'normal': {"kanji": final_normal['kanji'], "pref": final_normal['pref'], "municipality": final_normal['municipality']},
            'hard': {"kanji": final_hard['kanji'], "pref": final_hard['pref'], "municipality": final_hard['municipality']}
        }

    # 4. JSONファイルへの書き込み（本番用と管理者用）
    for d in range(today_index, today_index + 36):
        target_date = base_date + timedelta(days=d)
        year_str = str(target_date.year)
        date_str = target_date.strftime('%Y-%m-%d')
        
        filepath_hash = f'answers/{year_str}.json'
        filepath_admin = f'answers_admin/{year_str}_admin.json'

        # 本番用ファイル更新
        existing_hashes = {}
        if os.path.exists(filepath_hash):
            with open(filepath_hash, 'r', encoding='utf-8') as f:
                existing_hashes = json.load(f)
                
        existing_hashes[date_str] = generated_hashes[date_str]

        with open(filepath_hash, 'w', encoding='utf-8') as f:
            json.dump(existing_hashes, f, ensure_ascii=False, separators=(',', ':'))

        # 管理者用ファイル更新
        existing_admin = {}
        if os.path.exists(filepath_admin):
            with open(filepath_admin, 'r', encoding='utf-8') as f:
                existing_admin = json.load(f)
                
        existing_admin[date_str] = generated_admin[date_str]

        with open(filepath_admin, 'w', encoding='utf-8') as f:
            json.dump(existing_admin, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    generate_answers()
