import json
import hashlib
import os
from datetime import datetime, timedelta, timezone

# 駅ロケ専用のシークレットキー
SECRET_SALT = "EkiLocate_Secret_2026!"

# JSと完全に同じ結果を出すためのハッシュ演算用関数
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
    # 1. 駅データの読み込み
    try:
        with open('../stations.json', 'r', encoding='utf-8') as f:
            raw_stations = json.load(f)
    except Exception as e:
        print(f"駅データの取得に失敗しました: {e}")
        return

    # 2. 必須項目のチェックと貨物駅の除外
    valid_stations = []
    for s in raw_stations:
        companies = s.get('companies', [])
        # 都道府県、住所、営業キロが欠損しているものや、貨物駅を除外します
        if not s.get('pref') or not s.get('address') or s.get('min_km') is None or not companies:
            continue
        if len(companies) == 1 and companies[0] == "日本貨物鉄道":
            continue
        valid_stations.append(s)

    # 日付インデックスの計算
    base_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    now_jst = datetime.now(timezone(timedelta(hours=9)))
    today_index = (now_jst.date() - base_date.date()).days

    # 保存用フォルダの作成
    os.makedirs('answers', exist_ok=True)
    os.makedirs('answers_admin', exist_ok=True)

    generated_hashes = {}
    generated_admin = {}

    lookback = 1000 # 1000日間は出題を被らせない
    next_available_day = {}

    # 3. Day 0から今日＋35日後まで、通常とハードを共通の時間軸でシミュレーション
    for d in range(0, today_index + 35):
        # その日時点で現役の駅を抽出します
        active_stations = []
        for s in valid_stations:
            s_start = s.get('startDay')
            s_end = s.get('endDay')
            if s_start is not None and s_start > d:
                continue
            if s_end is None or s_end > d or s_end == 999999:
                active_stations.append(s)
                
        if not active_stations:
            active_stations = valid_stations

        # --- ① 通常モードの抽選 ---
        pool_normal = [s for s in active_stations if next_available_day.get(get_coord_key(s), 0) <= d]
        if not pool_normal:
            pool_normal = active_stations

        seed_n = d * 33333 + 54321
        hash_n = math_imul(seed_n ^ zero_fill_right_shift(seed_n, 15), 2246822507)
        hash_n = math_imul(hash_n ^ zero_fill_right_shift(hash_n, 13), 3266489909)
        hash_n = zero_fill_right_shift(hash_n ^ zero_fill_right_shift(hash_n, 16), 0)

        candidate_normal = pool_normal[hash_n % len(pool_normal)]
        
        # 通常モードで選ばれた駅を即座にクールダウンリストに登録します
        next_available_day[get_coord_key(candidate_normal)] = d + lookback + 1

        # --- ② ハードモードの抽選 ---
        # たった今選ばれたばかりの通常モードの駅が省かれるようにリストを再チェックします
        pool_hard = [s for s in active_stations if next_available_day.get(get_coord_key(s), 0) <= d]
        if not pool_hard:
            pool_hard = active_stations

        seed_h = d * 33333 + 99999
        hash_h = math_imul(seed_h ^ zero_fill_right_shift(seed_h, 15), 2246822507)
        hash_h = math_imul(hash_h ^ zero_fill_right_shift(hash_h, 13), 3266489909)
        hash_h = zero_fill_right_shift(hash_h ^ zero_fill_right_shift(hash_h, 16), 0)

        candidate_hard = pool_hard[hash_h % len(pool_hard)]
        
        # ハードモードで選ばれた駅もクールダウンリストに登録します
        next_available_day[get_coord_key(candidate_hard)] = d + lookback + 1

        # --- ③ 出力用データの保存（今日以降のものだけをファイル出力の対象にする） ---
        if d >= today_index:
            target_date = base_date + timedelta(days=d)
            date_str = target_date.strftime('%Y-%m-%d')
            
            if date_str not in generated_hashes:
                generated_hashes[date_str] = {}
                generated_admin[date_str] = {}
            
            # 答えがバレないように暗号化（ハッシュ化）します
            n_hashed = hashlib.sha256((SECRET_SALT + candidate_normal['kanji']).encode('utf-8')).hexdigest()
            h_hashed = hashlib.sha256((SECRET_SALT + candidate_hard['kanji']).encode('utf-8')).hexdigest()
            
            # JSONの項目として「normal」と「hard」を用意します
            generated_hashes[date_str]['normal'] = n_hashed
            generated_hashes[date_str]['hard'] = h_hashed
            
            # 管理者が手元で見るための平文データ（確認用に住所も付加）
            generated_admin[date_str]['normal'] = {
                "kanji": candidate_normal['kanji'],
                "yomi": candidate_normal['yomi'],
                "pref": candidate_normal['pref'],
                "municipality": candidate_normal['municipality']
            }
            generated_admin[date_str]['hard'] = {
                "kanji": candidate_hard['kanji'],
                "yomi": candidate_hard['yomi'],
                "pref": candidate_hard['pref'],
                "municipality": candidate_hard['municipality']
            }

    # 4. JSONファイルへの書き込み（直近の過去データは上書きしない安全仕様）
    for d in range(today_index, today_index + 33):
        target_date = base_date + timedelta(days=d)
        year_str = str(target_date.year)
        date_str = target_date.strftime('%Y-%m-%d')
        
        filepath_hash = f'answers/{year_str}.json'
        filepath_admin = f'answers_admin/{year_str}_admin.json'

        existing_hashes = {}
        if os.path.exists(filepath_hash):
            with open(filepath_hash, 'r', encoding='utf-8') as f:
                existing_hashes = json.load(f)
                
        # プレイ中の通信エラーを防ぐため、向こう3日間の答えは絶対に変更（上書き）しません
        if d <= today_index + 3:
            if date_str not in existing_hashes:
                existing_hashes[date_str] = generated_hashes[date_str]
        else:
            existing_hashes[date_str] = generated_hashes[date_str]

        with open(filepath_hash, 'w', encoding='utf-8') as f:
            json.dump(existing_hashes, f, ensure_ascii=False, separators=(',', ':'))

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
