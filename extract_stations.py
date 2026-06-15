# !pip install requests beautifulsoup4

import time
import json
import re
import requests
from bs4 import BeautifulSoup
import datetime
import os
import copy
import urllib.parse  # 追加：URLを解析するためのモジュール

#自治体データキャッシュ用
municipality_cache = {}

#自治体データキャッシュ用
municipality_cache = {}


# =========================================================================
# 【追加】URLの表記揺れ（エンコード）を解消して標準化する関数
# =========================================================================
def normalize_wikipedia_url(url_string):
    if not url_string:
        return ""
    # 「%E5%90%8D...」のようなエンコードを生の「名古屋市」などの日本語に直す
    decoded = urllib.parse.unquote(url_string)
    # 前後の余計な空白などを削除して返す
    return decoded.strip()


# =========================================================================
# 【修正】都市カテゴリJSONの読み込みと判定用セット（URLベース）の作成
# =========================================================================
DESIGNATED_CITIES_URLS = set()
CORE_CITIES_URLS = set()
SPECIAL_CITIES_URLS = set()
PREF_CAPITALS_URLS = set()

if os.path.exists("city_categories.json"):
    try:
        with open("city_categories.json", "r", encoding="utf-8") as f:
            city_categories_data = json.load(f)
            # URL全体をデコード（標準化）してセットに格納
            DESIGNATED_CITIES_URLS = set(normalize_wikipedia_url(item["url"]) for item in city_categories_data.get("政令指定都市", []))
            CORE_CITIES_URLS = set(normalize_wikipedia_url(item["url"]) for item in city_categories_data.get("中核市", []))
            SPECIAL_CITIES_URLS = set(normalize_wikipedia_url(item["url"]) for item in city_categories_data.get("施行時特例市", []))
            PREF_CAPITALS_URLS = set(normalize_wikipedia_url(item["url"]) for item in city_categories_data.get("都道府県庁所在地", []))
    except Exception as e:
        print(f"city_categories.json の読み込みに失敗しました: {e}")


# =========================================================================
# 【ここに追加！】uub.jpから最新の全国市区町村リストを全自動で取得する関数
# =========================================================================
# def fetch_all_municipalities():
#     url = "https://uub.jp/ctv/search.cgi?L=kanni&Pa=全国&B=最新&C=1&T=1&V=1&U=1&Dn=1&Dp=1&Dj=1&Da=1&Dm=1&R=stan&A=all&M=part"
#     headers = {
#         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
#     }
#     try:
#         print("uub.jp から最新の市区町村リストを取得しています...")
#         response = requests.get(url, headers=headers, timeout=10)
#         response.raise_for_status()
#        response.encoding = response.apparent_encoding
#         soup = BeautifulSoup(response.text, 'html.parser')

#         municipality_tags = soup.find_all('td', class_=['bcity', 'btown', 'bvill'])
#         municipalities = [tag.get_text(strip=True) for tag in municipality_tags]
#         return municipalities
#     except Exception as e:
#         print(f"市区町村リストの取得に失敗しました: {e}")
#         # 万が一uub.jpが落ちていた時のための最低限のセーフティネット（上郡町・平群町）
#         return ['上郡町', '平群町']



# =========================================================================
# 【差し替え箇所1】自治体ページから「都道府県」だけをピンポイントで抜く関数
# =========================================================================
def extract_municipality_data(html_text):
    """
    自治体のWikipediaページから、人口や面積などの詳細データを抽出する関数
    """
    soup = BeautifulSoup(html_text, 'html.parser')

    data = {
        "region": [],               # 地方
        "prefecture": "",           # 都道府県
        "muni_type": "",            # 自治体の種類（市、区、町、村）
        "name_kanji_len": 0,        # 固有名称の表記文字数
        "name_yomi_len": 0,         # 固有名称の読み文字数
        "city_code": "",            # 市町村コード
        "corporate_number": "",     # 法人番号
        "area": None,               # 面積（数字のみ）
        "population": None,         # 総人口（数字のみ）
        "population_density": None, # 人口密度（数字のみ）
        "first_paragraph": "",      # 冒頭の1段落
        "postal_code": ""           # 所在地の郵便番号
    }

    kanji_raw = ""
    yomi_raw = ""

    h1 = soup.find('h1', id='firstHeading')
    if h1:
        kanji_raw = re.sub(r'\s*\(.*?\)', '', h1.get_text(strip=True))

    infobox = soup.find('table', class_='infobox')
    if infobox:
        th_first = infobox.find('th')
        if th_first:
            for s in th_first.stripped_strings:
                if re.match(r'^[ぁ-んァ-ヶー]+(?:し|く|まち|ちょう|むら|そん)$', s):
                    yomi_raw = s
                    break

        for tr in infobox.find_all('tr'):
            th = tr.find('th')
            td = tr.find('td')
            if not th or not td:
                continue

            header = th.get_text(strip=True)
            # 注釈（[1]など）のリンクを完全に排除してからテキスト化
            td_copy = copy.copy(td)
            for sup in td_copy.find_all('sup'):
                sup.decompose()
            value = td_copy.get_text(" ", strip=True)

            if header == '地方':
                # 変更点1：value.replace(' ', '') を廃止し、区切りのスペースや改行をそのまま活かす
                # 変更点2：正規表現を「+? (最短一致)」にして、「北陸地方甲信越地方」と繋がるのを防ぐ
                regions = re.findall(r'[一-龠ぁ-んァ-ヶ]+?地方', value)

                # 重複を排除して配列（リスト）として格納する
                if regions:
                    data["region"] = list(dict.fromkeys(regions))

            elif header == '都道府県':
                # 全角「（）」および半角「()」で囲まれた部分（振興局など）を中身ごと完全に削除
                clean_pref = re.sub(r'[（\(]\s*.*?\s*[）\)]', '', value).strip()
                data["prefecture"] = clean_pref
            elif header == '都道府県':
                data["prefecture"] = value
            elif 'コード' in header:
                m = re.search(r'\d{5}-\d?', value)
                if m: data["city_code"] = m.group(0)
            elif header == '法人番号':
                m = re.search(r'\d+', value.replace(',', ''))
                if m: data["corporate_number"] = m.group(0)
            elif header == '面積':
                m = re.search(r'[\d\.]+', value.replace(',', ''))
                if m: data["area"] = float(m.group(0))
            elif header == '総人口' or header == '人口':
                m = re.search(r'\d+', value.replace(',', ''))
                if m: data["population"] = int(m.group(0))
            elif header == '人口密度':
                m = re.search(r'\d+', value.replace(',', ''))
                if m: data["population_density"] = int(m.group(0))
            elif header == '所在地':
                m = re.search(r'〒?\s*(\d{3}-\d{4})', value)
                if m: data["postal_code"] = m.group(1)

    # 文字数と種類の計算（大町町・大村市などの文字重複も正確に処理）
    if kanji_raw:
        match = re.search(r'(市|区|町|村)$', kanji_raw)
        if match:
            data["muni_type"] = match.group(1)
            data["name_kanji_len"] = len(kanji_raw) - 1

    if yomi_raw:
        if yomi_raw.endswith(('まち', 'むら', 'そん')):
            data["name_yomi_len"] = len(yomi_raw) - 2
        elif yomi_raw.endswith('ちょう'):
            data["name_yomi_len"] = len(yomi_raw) - 3
        elif yomi_raw.endswith(('し', 'く')):
            data["name_yomi_len"] = len(yomi_raw) - 1

    # 冒頭1段落の抽出（注釈の完全削除）
    content_div = soup.find("div", class_="mw-parser-output")
    if content_div:
        for p in content_div.find_all('p', recursive=False):
            if p.get('class') and 'mw-empty-elt' in p.get('class'):
                continue
            text = p.get_text(strip=True)
            if len(text) > 10:
                p_copy = copy.copy(p)
                for sup in p_copy.find_all('sup'):
                    sup.decompose()
                data["first_paragraph"] = p_copy.get_text(strip=True)
                break

    return data

BASE_INDEX_URL = "https://ja.wikipedia.org/wiki/日本の鉄道駅一覧"

# 万が一自動取得に失敗したときのためのバックアップリスト
BACKUP_SUB_PAGES = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
                 "さ", "し", "しや-しん", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
                 "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
                 "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
                 "る", "れ", "ろ", "わ", "を", "ん"]

def get_todays_sub_pages():
    print("Wikipediaトップページから最新のページ構成を自動取得しています...")
    sub_pages_all = []

    try:
        res = requests.get(BASE_INDEX_URL, headers={"User-Agent": "EkiDleBot/1.0"})
        soup = BeautifulSoup(res.text, "html.parser")

        for a in soup.find_all("a", href=True):
            href = urllib.parse.unquote(a["href"])
            # 検索条件を少し緩くして、確実にリンクを拾う
            if "/wiki/日本の鉄道駅一覧_" in href:
                page_name = href.split("日本の鉄道駅一覧_")[-1].split("#")[0]
                if page_name and "?" not in page_name and page_name not in sub_pages_all:
                    sub_pages_all.append(page_name)
    except Exception as e:
        print(f"自動取得中にエラーが発生しました: {e}")

    # 【重要】万が一、リストが空っぽ（0件）になってしまったらバックアップを使う安全装置
    if not sub_pages_all:
        print("⚠ ページ構成の自動取得に失敗したため、バックアップのリストを使用します。")
        sub_pages_all = BACKUP_SUB_PAGES
    else:
        print(f"正しいページインデックス（全{len(sub_pages_all)}ページ）を取得しました。")

    weekday = datetime.datetime.today().weekday()

    # ★動作テストのため、強制的に「6:日曜日」に設定します
    # weekday = 6

    # 取得した全ページを曜日ごとに自動で7等分する
    chunks = [[] for _ in range(7)]
    for i, page in enumerate(sub_pages_all):
        chunks[i % 7].append(page)

    # 万が一、分割後も箱が空だった場合のエラー回避
    if not chunks[weekday]:
        chunks[weekday] = ["あ"]

    # ★テスト用に「あ」のページだけを強制的に指定します
    return ["と"], weekday

    return chunks[weekday], weekday

def fetch_station_details(url):
    """
    駅のWikipediaページから各種データを抽出し、自治体データと統合する関数
    """
    data = {
        "pref": "",                # 都道府県名
        "county": "",              # 郡名
        "municipality": "",        # 市区町村名
        "ward": "",                # 政令指定都市の行政区名
        "muni_url": "",            # 自治体ページのURL
        "is_designated_city": False, # 政令指定都市か
        "is_core_city": False,       # 中核市か
        "is_special_city": False,    # 施行時特例市か
        "is_pref_capital": False,    # 都道府県庁所在地か
        "platforms": 0,            # 面数
        "tracks": 0,               # 線路数
        "min_km": float('inf'),    # 最小営業キロ
        "open_year": None,         # 開業年
        "open_month": None,        # 開業月
        "open_day": None,          # 開業日
        "max_passengers": 0,       # 最大乗降客数
        "companies": [],           # 所属事業者
        "lines": [],               # 乗入路線
        "romaji": "",              # アルファベット表記（最初のinfoboxのみ）
        "address": "",             # 住所（所在地）
        "latitude": None,          # 緯度
        "longitude": None,         # 経度
        "adjacent_stations": [],   # 隣駅リスト（辞書形式: name, link）
        "transfer_stations": []    # 乗換駅リスト（辞書形式: name, link）
    }

    try:
        res = requests.get(url, headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
        soup = BeautifulSoup(res.text, "html.parser")

        infoboxes = soup.find_all('table', class_='infobox')

        # ↓↓↓ ここから追加 ↓↓↓
        # 廃止駅確認処理
        active_infoboxes = []
        for box in infoboxes:
            is_abolished = False

            # 取得した表の行(tr)を1行ずつ確認する
            for tr in box.find_all('tr'):
                th = tr.find('th') # 見出し（「開業年月日」や「廃止年月日」など）
                td = tr.find('td') # 中身（「1980年」など）

                # 見出しと中身の両方が存在する場合のみ判定
                if th and td:
                    # 見出しに「廃止」が含まれ、かつ中身が空っぽではない場合
                    # （※Wikipediaの仕様上、項目だけあって中身が空のケースを安全にスルーするため）
                    if '廃止' in th.get_text(strip=True) and td.get_text(strip=True):
                        is_abolished = True
                        print("      [除外] 廃止情報が含まれる表を検知したため、抽出から除外しました。")
                        break # 廃止表と確定した時点で、この表の確認を終了


            # 廃止フラグが立っていない（現役の）表だけをリストに追加する
            if not is_abolished:
                active_infoboxes.append(box)


        # これ以降の処理を、現役の表（active_infoboxes）だけで行うようにデータを上書きする
        infoboxes = active_infoboxes
        # ↑↑↑ ここまで追加 ↑↑↑

        # ↓↓↓ ここから追加 ↓↓↓
        best_addr = ""
        best_lat = None
        best_lon = None
        best_loc_td = None # ★追加：最古の所在地のHTMLタグそのものを記憶する変数
        oldest_y = float('inf')

        for box in infoboxes:
            box_addr = ""
            box_lat = None
            box_lon = None
            box_loc_td = None
            box_y = None

            # まず、このInfobox内に座標タグがあるか探す
            #infoboxから座標を取得する
            geo_span = box.find('span', class_='geo')
            if geo_span:
                lat_lon = geo_span.get_text(strip=True).split(';')
                if len(lat_lon) == 2:
                    try:
                        box_lat = float(lat_lon[0].strip())
                        box_lon = float(lat_lon[1].strip())
                    except ValueError:
                        pass

            # ★追加：この箱の中に本物の「所在地」見出しがあるか事前チェック
            box_has_real_location = any(t.find('th') and t.find('th').get_text(strip=True) == '所在地' for t in box.find_all('tr'))

            #infoboxから所在地を取得する
            for tr in box.find_all('tr'):
                th = tr.find('th')
                td = tr.find('td')

                hdr = ""
                # 通常処理：見出しと中身がある場合
                if th and td:
                    hdr = th.get_text(strip=True)
                # 予備処理：見出しが無く、本物の所在地行も存在しない場合（「所在地幅=long」対応）
                elif not th and td:
                    txt = td.get_text(" ", strip=True)
                    if not box_has_real_location and re.search(r'(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', txt):
                        hdr = '所在地'

                # 判定結果（hdr）をもとにデータを抽出
                if hdr == '所在地':
                    clean = re.split(r'<div|<sup', str(td))[0]
                    txt = BeautifulSoup(clean, "html.parser").get_text(strip=True)
                    box_addr = re.split(r'\[|座標:|北緯|〒', txt)[0].strip()
                    box_loc_td = td # 所在地のtdタグを確保
                elif '開業年月日' in hdr:
                    m = re.search(r'(\d{4})年', td.get_text(strip=True))
                    if m:
                        y = int(m.group(1))
                        if box_y is None or y < box_y:
                            box_y = y

            # 最初の住所・座標を保険としてキープ
            if box_addr and not best_addr:
                best_addr = box_addr
                best_loc_td = box_loc_td
            if box_lat is not None and best_lat is None:
                best_lat = box_lat
                best_lon = box_lon

            # より古い開業年が見つかれば、そのInfoboxの住所・座標で上書き！
            if box_y is not None and box_y < oldest_y:
                oldest_y = box_y
                if box_addr:
                    best_addr = box_addr
                    best_loc_td = box_loc_td
                if box_lat is not None:
                    best_lat = box_lat
                    best_lon = box_lon

        data["address"] = best_addr
        data["latitude"] = best_lat
        data["longitude"] = best_lon
        # ↑↑↑ ここまで追加 ↑↑↑

        # （これ以降は、もともとある既存の for tr in infobox.find_all('tr'): などの処理が続きます）

        # 複数のInfoboxを1つずつ順番に処理する
        for idx, infobox in enumerate(infoboxes):

            # --- 【追加】アルファベット表記の抽出（最初のinfoboxのみ） ---
            if idx == 0:
                romaji_span = infobox.find('span', lang='en')
                if romaji_span:
                    data["romaji"] = romaji_span.get_text(strip=True)

            # --- 【修正】隣駅の抽出（リンク付き） ---
            # 「float:left」と「float:right」のdivが横並びになっている行を探す
            for tr in infobox.find_all('tr'):
                tds = tr.find_all('td')
                if len(tds) == 1 and tds[0].get('colspan') == "2":
                    left_div = tds[0].find('div', style=lambda s: s and 'float:left' in s.replace(' ', ''))
                    right_div = tds[0].find('div', style=lambda s: s and 'float:right' in s.replace(' ', ''))

                    # 左右のdivの中からリンク付きで駅名を取り出す内部関数
                    def add_adjacent(div_node):
                        if div_node:
                            for a in div_node.find_all('a'):
                                txt = a.get_text(strip=True)
                                href = a.get('href')
                                # 画像リンク（駅ナンバリングのアイコン等）を弾き、名前とリンクがあるものだけ抽出
                                if href and '/wiki/' in href and a.get('title') and txt:
                                    full_link = urllib.parse.urljoin("https://ja.wikipedia.org", href)
                                    # 既に同じ駅名が登録されていなければ追加
                                    if not any(adj["name"] == txt for adj in data["adjacent_stations"]):
                                        data["adjacent_stations"].append({"name": txt, "link": full_link})

                    add_adjacent(left_div)
                    add_adjacent(right_div)

            # --- 【追加】本物の「所在地」見出しがあるか事前チェック ---
            has_real_location = any(tr.find('th') and tr.find('th').get_text(strip=True) == '所在地' for tr in infobox.find_all('tr'))

            # ここから元の処理（<th>と<td>のペアを探す処理）が続く
            for tr in infobox.find_all('tr'):
                th = tr.find('th')
                td = tr.find('td')


                # ▼ここから不要
                # th必須にする処理は土合駅でバグを起こすため廃止
                # 見出し(th)と中身(td)のペアが揃っていない行は、すべて問答無用で無視する
                # if not th or not td:
                #     continue

                # header = th.get_text(strip=True)
                # value_text = td.get_text(" ", strip=True)
                # ▲ここまで不要

                header = ""
                value_text = ""

                if th and td:
                    header = th.get_text(strip=True)
                    value_text = td.get_text(" ", strip=True)
                elif not th and td:
                    value_text = td.get_text(" ", strip=True)
                    # 郵便番号等があってもマッチするように re.search を使用
                    # 【変更】土合駅のように本物の所在地が「存在しない」場合のみ、都道府県名を頼りに推測を発動する
                    if not has_real_location and re.search(r'(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', value_text):
                        header = '所在地'
                else:
                    continue



                # ① 所在地と住所の抽出
                if header == '所在地':

                    # ▼ここから不要
                    # 古い開業年月日を取得する段階で座標も取得するようになったため不要
                    # 【シンプル化】注釈(<sup)や座標等の補足(<div)が始まる前までのHTMLを切り出してテキスト化
                    # clean_html = re.split(r'<div|<sup', str(td))[0]
                    # address_text = BeautifulSoup(clean_html, "html.parser").get_text(strip=True)
                    # 念のため、テキスト上のゴミ（[1]、座標、郵便番号など）から先を完全にカット
                    # address_text = re.split(r'\[|座標:|北緯|〒', address_text)[0].strip()

                    # このInfobox内で見つけた住所として一時保存
                    # if address_text:
                    #     local_address = address_text
                    #     if not fallback_address:
                    #        fallback_address = local_address
                    # ▲ここまで不要

                    # ★変更：現在見ている td ではなく、事前ループで勝ち残った「最古の td (best_loc_td)」を使う
                    target_td = best_loc_td if best_loc_td else td

                    # 1. 駅ページから都道府県を優先取得
                    if not data["pref"]:
                        m_pref = re.search(r'(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', target_td.get_text(strip=True))
                        if m_pref:
                            data["pref"] = m_pref.group(1)

                    # 2. 所在地内のリンクから市区町村と行政区を抽出
                    if not data.get("municipality") or not data.get("ward"):
                        for a in target_td.find_all('a'):
                            txt = a.get_text(strip=True)
                            href = a.get('href')

                            if not href or '/wiki/' not in href:
                                continue

                            is_tokyo_ku = txt.endswith('区') and (data["pref"] == '東京都' or '東京' in value_text)

                            # ★変更箇所：郡名と市区町村を独立して抽出
                            if txt.endswith('郡'):
                                if not data.get("county"):
                                    data["county"] = txt

                            # 市区町村の特定とURLの確保
                            elif txt.endswith(('市', '町', '村')) or is_tokyo_ku:
                                if not data["municipality"]:
                                    data["municipality"] = txt
                                    data["muni_url"] = urllib.parse.urljoin("https://ja.wikipedia.org", href)

                            # 政令指定都市の行政区は名前のみ抽出
                            elif txt.endswith('区'):
                                if not data["ward"]:
                                    data["ward"] = txt

                    # 3. リンクから市区町村名が取れなかった場合の予備処理
                    if not data["municipality"]:
                        loc = re.sub(r'〒?\s*\d{3}-\d{4}', '', value_text).strip()
                        loc = re.sub(r'^(?:東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', '', loc).strip()
                        # 【スペース削除対応】空白を完全に消去してから判別
                        loc = loc.replace(' ', '').replace(' ', '')

                        # ★変更箇所：郡と市区町村を別々にキャプチャする
                        m = re.match(r'^((?:.+?郡)?)(.+?(?:市|区|町|村))', loc)
                        if m:
                            county_str = m.group(1)
                            muni_str = m.group(2)

                            if county_str:
                                data["county"] = county_str

                            # 大町町や野々市市などの文字重複対策
                            if loc.startswith(county_str + muni_str + muni_str[-1]):
                                muni_str += muni_str[-1]
                            if loc.startswith(county_str + muni_str + '市'):
                                muni_str += '市'

                            data["municipality"] = muni_str

                    # =====================================================================
                    # 【修正】URLの直接比較による都市カテゴリの判定と、偽の行政区の除外処理
                    # =====================================================================
                    # スクレイピングで取得した自治体URLをデコードして標準化
                    normalized_muni_url = normalize_wikipedia_url(data["muni_url"])

                    if normalized_muni_url:
                        # 標準化されたURL同士で直接判定（非常に堅牢です）
                        data["is_designated_city"] = normalized_muni_url in DESIGNATED_CITIES_URLS
                        data["is_core_city"]       = normalized_muni_url in CORE_CITIES_URLS
                        data["is_special_city"]    = normalized_muni_url in SPECIAL_CITIES_URLS
                        data["is_pref_capital"]    = normalized_muni_url in PREF_CAPITALS_URLS

                    # 【区の誤判定防止】
                    # すでに ward（区）が抽出されているが、親の自治体が「政令指定都市」ではない場合
                    muni_name = data["municipality"]
                    if data["ward"] and not data["is_designated_city"] and data["pref"] != "東京都":
                        print(f"      [補正] {muni_name} は政令指定都市ではないため、行政区 '{data['ward']}' を除外しました。")
                        data["ward"] = ""  # 偽の行政区をリセット
                    # =====================================================================

                    # 4. 【合体】自治体データを取得して駅データに統合
                    if data["muni_url"]:
                        if data["muni_url"] not in municipality_cache:

                            # ★変更箇所：ログ出力時に郡名と市区町村名を足して表示
                            full_muni_name = data.get("county", "") + data["municipality"]
                            print(f"    自治体詳細データを取得中: {full_muni_name}")

                            try:
                                m_res = requests.get(data["muni_url"], headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
                                municipality_cache[data["muni_url"]] = extract_municipality_data(m_res.text)
                            except Exception:
                                municipality_cache[data["muni_url"]] = {}

                        muni_data = municipality_cache[data["muni_url"]]

                        # 都道府県が駅ページに無かった場合は自治体データから補完
                        if not data["pref"] and muni_data.get("prefecture"):
                            data["pref"] = muni_data["prefecture"]

                        # 抽出した人口や面積などを駅データに結合
                        data.update(muni_data)

                # ② ホーム面数・線路数
                elif 'ホーム' in header:
                    matches = re.findall(r'(\d+)\s*面\s*(\d+)\s*線', value_text)
                    for m, s in matches:
                        data["platforms"] = max(data["platforms"], int(m))
                        data["tracks"] = max(data["tracks"], int(s))

                # ③ キロ程
                elif 'キロ程' in header:
                    matches = re.findall(r'(\d+(?:\.\d+)?)', value_text)
                    for km_str in matches:
                        data["min_km"] = min(data["min_km"], float(km_str))

                # ④ 開業年月日
                elif '開業年月日' in header:
                    m_date = re.search(r'(\d{4})年(?:.*?(\d+)月(\d+)日)?', value_text)
                    if m_date:
                        found_year = int(m_date.group(1))
                        # 初回登録、または今回見つけた年が既存の年より古い場合のみ上書きする
                        if not data["open_year"] or found_year < data["open_year"]:
                            data["open_year"] = found_year
                            data["open_month"] = int(m_date.group(2)) if m_date.group(2) else None
                            data["open_day"] = int(m_date.group(3)) if m_date.group(3) else None

                # ⑤ 乗降人員
                elif '乗車人員' in header or '乗降人員' in header:
                    clean_val = value_text.replace(',', '')
                    matches = re.findall(r'(\d+)\s*人', clean_val)
                    for num_str in matches:
                        data["max_passengers"] = max(data["max_passengers"], int(num_str))

                # ⑥ 所属事業者
                elif '所属事業者' in header or '事業者' in header:
                    clean_val = re.sub(r'（[^）]*）|\([^)]*\)|\[[^\]]*\]', '', value_text)
                    comps = [c.strip() for c in re.split(r'\s|・', clean_val) if c.strip()]
                    for c in comps:
                        if c and c not in data["companies"]:
                            data["companies"].append(c)

                # ⑦ 所属路線
                elif '所属路線' in header or header == '路線':
                    paren_depth = 0

                    # td要素内のすべての要素とテキストを上から順番に走査
                    for node in td.descendants:

                        # テキストデータ（文字）の場合、カッコの開閉状態をカウント
                        if getattr(node, 'name', None) is None:
                            text_str = str(node)
                            paren_depth += text_str.count('（') + text_str.count('(')
                            paren_depth -= text_str.count('）') + text_str.count(')')
                            paren_depth = max(0, paren_depth) # マイナスにならないようガード

                        # aタグの場合
                        elif getattr(node, 'name', None) == 'a':
                            # 現在カッコに囲まれた階層（直通路線や列車線の補足など）にいる場合はスキップ
                            if paren_depth > 0:
                                continue

                            # title属性（Wikipediaの正式な記事名）を取得
                            line_name = node.get('title')

                            # title属性が存在しないリンクはスキップ
                            if not line_name:
                                continue

                            # 路線名の重複を防ぎつつリストに追加
                            if line_name not in data["lines"]:
                                data["lines"].append(line_name)

                # ↓↓↓ ここから追加 ↓↓↓
                # ⑧ 乗換駅の名前とリンクの抽出
                elif '乗換' in header:
                    for a in td.find_all('a'):
                        txt = a.get_text(strip=True)
                        href = a.get('href')
                        # 路線名（ゆりかもめ等）が混ざるのを防ぐため、「〜駅」で終わるリンクのみを厳格に抽出する
                        if href and '/wiki/' in href and txt.endswith('駅'):
                            full_link = urllib.parse.urljoin("https://ja.wikipedia.org", href)
                            # 重複登録を防ぐ
                            if not any(ts["name"] == txt for ts in data["transfer_stations"]):
                                data["transfer_stations"].append({"name": txt, "link": full_link})
                # ↑↑↑ ここまで追加 ↑↑↑

    except Exception as e:
        # 何のエラーで失敗したか分かるように表示する
        print(f"      [警告] データ抽出中にエラーが発生しました: {e}")
        pass

    # try-except の外に安全装置を置くことで、エラー発生時でも確実に変換させる
    if data["min_km"] == float('inf'):
        data["min_km"] = 999999

    return data



def extract_and_count_stations():
    stations_list = []

    headers = {
        "User-Agent": "EkiDleBot/1.0"
    }

    # ★ 処理の一番最初、ループに入る前に市区町村リストを取得します！
    # muni_list = fetch_all_municipalities()
    # if muni_list:
    #     print(f"取得完了：合計 {len(muni_list)} 件の市区町村データを例外リストとして使用します。")
    # else:
    #     print("市区町村リストの取得に失敗したため、例外判定なしで続行します。")

    print("Wikipediaからの駅名抽出（全文字数・例外対応版）を開始します...")

    SUB_PAGES, weekday_num = get_todays_sub_pages()
    weekdays_str = ["月", "火", "水", "木", "金", "土", "日"]
    print(f"本日は【{weekdays_str[weekday_num]}曜日】の割り当て分（{'、'.join(SUB_PAGES)}）を抽出します。")

    for page in SUB_PAGES:
        url = f"{BASE_INDEX_URL}_{page}"
        print(f"読み込み中: {url}")

        try:
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                print(f"ページの取得に失敗しました: {page}")
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            content_div = soup.find("div", class_="mw-content-ltr")
            if not content_div:
                continue

            li_tags = content_div.find_all("li")

            for li in li_tags:
                a_tag = li.find("a")
                if not a_tag or not a_tag.get("href"):
                    continue

                href = a_tag.get("href")
                wiki_url = "https:" + href if href.startswith("//") else "https://ja.wikipedia.org" + href

                # 【処理1】表示名（漢字等）の決定
                # 駅名や(都道府県)などのカッコ書きを含め、そのまま表示名として採用する
                kanji_raw = a_tag.get_text()
                display_name = kanji_raw.strip()

                # 【処理2】読み（ひらがな）の抽出
                yomi = ""
                next_node = a_tag.next_sibling

                # <a>タグ直後のテキスト（ヨミガナ部分）から、一番外側のカッコの中身を取り出す
                if next_node and hasattr(next_node, 'strip'):
                    # 貪欲マッチ (.*) を使うことで、入れ子のカッコを破壊せずにひとまとめに取得
                    match = re.search(r"^（(.*)）", next_node.strip())

                    if match:
                        inner_text = match.group(1)

                        # ▼▼▼ ここから差し替え ▼▼▼
                        # 1. 【URL側の検証】曖昧さ回避の「_(...)」を消した純粋な記事名から「・」を数える
                        page_title = urllib.parse.unquote(href.split("/wiki/")[-1])
                        url_clean_name = page_title.split("_(")[0]
                        url_dots = url_clean_name.count('・')

                        # 2. 【表示名側の検証】「 (JR...)」のような半角カッコ（曖昧さ回避）だけを消去して「・」を数える
                        # ※正規表現 \s*\(.*?\) は半角カッコのみを消すため、五福末広町などの全角カッコ「（）」は安全に保護されます
                        display_clean_name = re.sub(r'\s*\(.*?\)', '', display_name)
                        display_dots = display_clean_name.count('・')

                        # 3. URLと表示名、どちらか「・」が多い方を採用する（Wikipediaのリンクのサボりを強制補完）
                        dot_count = max(url_dots, display_dots)

                        # 4. カッコの中身（読み）を「・」で分割する
                        parts = inner_text.split('・')

                        # 5. 「・」の数 ＋ 1 個分のパーツを取得する（構造的な上限）
                        valid_parts = parts[:dot_count + 1]

                        # 6. 【ユーザー考案の最強防壁】漢字を含むパーツ（路線名など）を確実に除外する
                        # これにより、万が一「dot_count」が多すぎても、無関係な路線名が結合されるのを防ぎます
                        filtered_parts = [p for p in valid_parts if not re.search(r'[一-龠]', p)]

                        # 万が一すべて除外された場合の保険
                        if not filtered_parts:
                            filtered_parts = [parts[0]]

                        # 7. 採用したパーツを再び「・」で繋ぐ
                        yomi_raw = "・".join(filtered_parts)

                        # 8. 最後に末尾の「えき」等を削除
                        yomi_raw = re.sub(r"(えき|ていりゅうじょう|しんごうじょう|停留場)$", "", yomi_raw)
                        # ▲▲▲ ここまで差し替え ▲▲▲

                        # 記号やスペース、アルファベット等をすべて排除し、純粋な「かな」にする（※ここは残す！）
                        yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", yomi_raw)
                        # 読みのカタカナをひらがなにする
                        # yomi="".join([chr(ord(c)-0x60)if 0x30A1<=ord(c)<=0x30F6 else c for c in yomi])

                if not yomi:
                    # みなとみらい駅など、カッコ自体がない場合のバックアップ（※これも残す！）
                    yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", display_name)

                if not yomi:
                    continue

                print(f"  詳細データ取得中: {display_name}")
                details = fetch_station_details(wiki_url)

                # subPage を追加して、どの五十音ページから見つかったかを記録させる
                details.update({"kanji": display_name, "yomi": yomi, "url": wiki_url, "subPage": page})
                stations_list.append(details)

                # サーバー負担軽減のための待機時間を2秒に設定
                time.sleep(2)

        except Exception as e:
            print(f"エラーが発生しました: {e}")

        time.sleep(2.0) # サーバー負担軽減

    # 重複排除と既存データの統合
    existing_stations = {}
    if os.path.exists("stations.json"):
        try:
            with open("stations.json", "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    existing_stations[item["url"]] = item
        except json.JSONDecodeError:
            pass

    # =========================================================================
    # 【究極改修】新駅・廃駅・Wikipediaのページ名変更すら全自動追従するロジック
    # =========================================================================
    existing_stations = {}
    max_id = 0

    # 2024年1月1日を基準とした、今日の日付インデックス（経過日数）を計算
    base_date = datetime.datetime(2024, 1, 1)
    today_dt = datetime.datetime.today()
    current_day_index = (today_dt - base_date).days

    # 【超重要】今日割り当てのページだけでなく、「現在のWikipediaに存在する全ページ」を裏で取得しておく
    # get_todays_sub_pages() を少し改造するか、ここで全ページリストを取得できるようにします
    # 今回は安全のため、BACKUP_SUB_PAGES も含めた「今存在するはずの全ページ名」を仮定します
    # ※もし可能なら、get_todays_sub_pages() が「今日の分」と「全ページ分」を両方返すようにすると最強です。
    # ここでは、元の get_todays_sub_pages を活かしつつ、通信して全ページを把握するロジックにします。
    all_wikipedia_sub_pages = []
    try:
        res_all = requests.get(BASE_INDEX_URL, headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
        soup_all = BeautifulSoup(res_all.text, "html.parser")
        for a in soup_all.find_all("a", href=True):
            href = urllib.parse.unquote(a["href"])
            if "/wiki/日本の鉄道駅一覧_" in href:
                p_name = href.split("日本の鉄道駅一覧_")[-1].split("#")[0]
                if p_name and "?" not in p_name and p_name not in all_wikipedia_sub_pages:
                    all_wikipedia_sub_pages.append(p_name)
    except Exception:
        all_wikipedia_sub_pages = BACKUP_SUB_PAGES

    # 変更があった駅の情報を記録するためのリスト
    updated_summary = []

    # 1. 既存の JSON データを読み込む（古いデータの自動アップデート付き）
    if os.path.exists("stations.json"):
        try:
            with open("stations.json", "r", encoding="utf-8") as f:
                data = json.load(f)

                # ① 最大のIDを特定
                for item in data:
                    if item.get("id") is not None and item["id"] > max_id:
                        max_id = item["id"]

                # ② データを辞書に登録しつつ、足りないデータを一括で初期化する
                for item in data:
                    # まだIDを持たない古い駅にIDを割り振る
                    if item.get("id") is None:
                        max_id += 1
                        item["id"] = max_id

                    # ★【ここが追加部分】既存の駅に startDay / endDay が無ければ 0 と 999999 で補完！
                    if "startDay" not in item:
                        item["startDay"] = 0
                    if "endDay" not in item:
                        item["endDay"] = 999999

                    # 【修正1】URLと漢字の合体キーを生成して登録する
                    base_url = item.get("url", "")
                    kanji = item.get("kanji", "")
                    unique_key = item.get("unique_key", f"{base_url}_{kanji}")
                    item["unique_key"] = unique_key
                    existing_stations[unique_key] = item
        except json.JSONDecodeError:
            pass

    # 【修正1の続き】生存確認用のリストも合体キーに変更
    fetched_keys = set(f"{v['url']}_{v['kanji']}" for v in stations_list)

    # 2. 今回取得したデータを既存データと統合（新駅検知＆復活駅の完全安全化）
    for v in stations_list:
        # 【修正2】URLではなく合体キーを使用する
        unique_key = f"{v['url']}_{v['kanji']}"
        v["unique_key"] = unique_key

        if unique_key in existing_stations:
            old_item = existing_stations[unique_key]

            # --- 【超安全化】もし「過去に完全に廃止された駅」だった場合 ---
            if old_item.get("endDay", 999999) < current_day_index:

                # 過去のデータは「過去問の歴史」として残すため、キーの末尾に履歴を付けて退避
                archived_key = unique_key + f"_archived_day{old_item['endDay']}"
                existing_stations[archived_key] = old_item

                # 今回復活した駅は、新しいIDを振って新規登録する！
                max_id += 1
                v["id"] = max_id
                v["startDay"] = current_day_index
                v["endDay"] = 999999
                v["missingCount"] = 0

                existing_stations[unique_key] = v
                print(f"  [安全復活検知] 過去に廃止された駅 {v['kanji']} を、過去問を汚さないよう新しいID({max_id})で新規登録しました。")
                continue

            # --- 通常の現役駅のアップデート処理 ---
            preserved_id = old_item.get("id")
            preserved_start = old_item.get("startDay", 0)
            preserved_end = old_item.get("endDay", 999999)

            # 【究極安全化】もし「読みがな(文字数)」が変更されていたら別駅として世代交代させる
            if old_item.get("yomi") != v["yomi"]:
                archived_key = unique_key + f"_archived_yomi{current_day_index}"
                old_item["endDay"] = current_day_index
                existing_stations[archived_key] = old_item

                max_id += 1
                v["id"] = max_id
                v["startDay"] = current_day_index
                v["endDay"] = 999999
                v["missingCount"] = 0
                existing_stations[unique_key] = v
                print(f"  [読みがな変更検知] {v['kanji']} の読みが変更されたため、新ID({max_id})で世代交代しました。({old_item.get('yomi')} -> {v['yomi']})")
                continue

            # =========================================================================
            # 【追加】完全データ保護ロジック（一括復元）
            # =========================================================================
            # 距離がエラー値であり、かつ住所も空っぽなら「明らかな通信エラー」と判定する
            is_fetch_failed = (v["min_km"] is None and not v["address"])

            if is_fetch_failed:
                # 取得失敗時は、新しい空っぽのデータ(v)を捨てて、過去のデータ(old_item)をそのまま残す
                existing_stations[unique_key] = old_item
                existing_stations[unique_key]["missingCount"] = 0
                print(f"  [完全保護] {v['kanji']} の通信エラーを検知。過去の全データを安全に復元しました。")
            else:
                # --- 【変更】全データ項目の変更を自動検知して記録する ---
                # システムが管理する項目（更新比較の対象外）
                ignore_keys = {"id", "startDay", "endDay", "missingCount", "unique_key", "subPage", "url"}

                station_changes = {}
                for key in v.keys():
                    if key in ignore_keys:
                        continue
                    old_val = old_item.get(key)
                    new_val = v.get(key)
                    if old_val != new_val:
                        station_changes[key] = {"old": old_val, "new": new_val}

                if station_changes:
                    updated_summary.append({
                        "kanji": v["kanji"],
                        "changes": station_changes
                    })
                    print(f"  [データ更新] {v['kanji']} の情報が更新されました（{len(station_changes)}項目）。")

                # 正常に取得できた場合は、新しいデータで上書き（ただしID等のシステム数値は引き継ぐ）
                existing_stations[unique_key] = v
                existing_stations[unique_key]["id"] = preserved_id
                existing_stations[unique_key]["startDay"] = preserved_start
                existing_stations[unique_key]["endDay"] = preserved_end
                existing_stations[unique_key]["missingCount"] = 0
        else:
            # 純粋な新駅
            max_id += 1
            v["id"] = max_id
            v["startDay"] = current_day_index
            v["endDay"] = 999999
            v["missingCount"] = 0
            existing_stations[unique_key] = v
            print(f"  [新駅検知] 新しい駅が追加されました (ID: {max_id}): {v['kanji']}")

    # 3. 廃駅の自動検知ロジック（★猶予期間付きサバイバル方式へ超絶強化）
    if len(stations_list) > 0:
        # 【修正3】ループの変数を unique_key に変更
        for unique_key, item in list(existing_stations.items()):
            # すでに廃駅処理済みのものはスキップ
            if item.get("endDay", 999999) < 999999:
                continue

            sub_page = item.get("subPage")
            missing_count = item.get("missingCount", 0)

            # --- パターンA: ページ名は健在なのに、駅から消えた場合（通常の廃駅） ---
            # これは言い訳のしようがないので、その日のうちに即座に廃駅にします。
            if sub_page in SUB_PAGES:
                # 【修正3】fetched_keys で判定する
                if unique_key not in fetched_keys:
                    item["endDay"] = current_day_index
                    item["subPage"] = "廃止済"
                    print(f"  [廃駅検知] Wikipediaから消滅した駅を廃止に設定しました: {item['kanji']}")
                    continue

            # --- パターンB: Wikipediaの仕様変更でページ自体が消え、駅が迷子になった場合 ---
            if sub_page not in all_wikipedia_sub_pages and sub_page != "引っ越し調査中":
                item["subPage"] = "引っ越し調査中"
                item["missingCount"] = 1
                print(f"  [仕様変更検知] ページ消滅につき、駅を引っ越し調査中に設定しました: {item['kanji']}")
                continue

            # --- パターンC: 「引っ越し調査中」の駅の、その後の生存確認 ---
            if sub_page == "引っ越し調査中":
                # 【修正3】fetched_keys で判定する
                if unique_key not in fetched_keys:
                    missing_count += 1
                    item["missingCount"] = missing_count

                    # 14日間（＝全曜日を2周）どこからも見つからなかったら、本当にこの世から消えたとみなす
                    if missing_count >= 14:
                        item["endDay"] = current_day_index
                        item["subPage"] = "廃止済"
                        print(f"  [廃駅確定] 2週間どこからも発見されなかったため、廃駅と判定しました: {item['kanji']}")

    # 4. リスト化し、常にID順でソート
    result_list = list(existing_stations.values())
    result_list.sort(key=lambda x: x["id"])

    # 5. JSONファイルへ書き込み
    with open("stations.json", "w", encoding="utf-8") as f:
        json.dump(result_list, f, ensure_ascii=False, indent=2)


    # ＝＝＝＝＝＝ 文字数ごとの集計（既存の処理） ＝＝＝＝＝＝
    length_counts = {}
    active_count = 0
    for s in result_list:
        if s.get("endDay", 999999) == 999999: # 現役の駅だけカウント
            active_count += 1
            l = len(s["yomi"])
            length_counts[l] = length_counts.get(l, 0) + 1

    print("\n========================================")
    print("抽出・同期完了！ 現役駅の文字数内訳：")
    for length in sorted(length_counts.keys()):
        print(f" {length:2}文字の駅名 : {length_counts[length]:4} 駅")
    print("----------------------------------------")
    print(f"👉 総データ数 : {len(result_list)} 駅 (うち現役: {active_count} 駅) を 'stations.json' に保存しました。")
    print("========================================")

    # --- 【追加】変更レポートの一括出力 ---
    if updated_summary:
        print("\n========================================")
        print(f"🔄 【更新レポート】既存データに変更があった駅（計 {len(updated_summary)} 駅）")
        print("========================================")
        for info in updated_summary:
            print(f"■ {info['kanji']}")
            for k, diff in info['changes'].items():
                print(f"  - {k}: {diff['old']} -> {diff['new']}")
        print("========================================")

if __name__ == "__main__":
    extract_and_count_stations()
