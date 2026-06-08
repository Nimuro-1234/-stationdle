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

import re
import copy
from bs4 import BeautifulSoup

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
    weekday = 0

    # 取得した全ページを曜日ごとに自動で7等分する
    chunks = [[] for _ in range(7)]
    for i, page in enumerate(sub_pages_all):
        chunks[i % 7].append(page)

    # 万が一、分割後も箱が空だった場合のエラー回避
    if not chunks[weekday]:
        chunks[weekday] = ["あ"]

    # ★テスト用に「あ」のページだけを強制的に指定します
    # return ["と"], weekday

    return chunks[weekday], weekday

def fetch_station_details(url):
    """
    駅のWikipediaページから各種データを抽出し、自治体データと統合する関数
    """
    data = {
        "pref": "",
        "municipality": "",
        "ward": "",                 # 政令指定都市の行政区名のみ
        "muni_url": "",             # 自治体ページのURL保存用
        "platforms": 0,
        "tracks": 0,
        "min_km": float('inf'),
        "open_year": None,
        "open_month": None,
        "open_day": None,
        "max_passengers": 0,
        "companies": [],
        "lines": []
    }

    try:
        res = requests.get(url, headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
        soup = BeautifulSoup(res.text, "html.parser")

        infoboxes = soup.find_all('table', class_='infobox')
        for infobox in infoboxes:
            for tr in infobox.find_all('tr'):
                th = tr.find('th')
                td = tr.find('td')

                header = ""
                value_text = ""

                if th and td:
                    header = th.get_text(strip=True)
                    value_text = td.get_text(" ", strip=True)
                elif not th and td:
                    value_text = td.get_text(" ", strip=True)
                    # 郵便番号等があってもマッチするように re.search を使用
                    if re.search(r'(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', value_text):
                        header = '所在地'
                else:
                    continue

                # ① 所在地と自治体データの自動取得
                if header == '所在地':
                    # 1. 駅ページから都道府県を優先取得
                    if not data["pref"]:
                        m_pref = re.search(r'(東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)', value_text)
                        if m_pref:
                            data["pref"] = m_pref.group(1)

                    # 2. 所在地内のリンクから市区町村と行政区を抽出
                    if not data.get("municipality") or not data.get("ward"):
                        for a in td.find_all('a'):
                            txt = a.get_text(strip=True)
                            href = a.get('href')

                            # 修正箇所1：startswithではなく、inを使って柔軟に判定
                            if not href or '/wiki/' not in href:
                                continue

                            is_tokyo_ku = txt.endswith('区') and (data["pref"] == '東京都' or '東京' in value_text)

                            # 市区町村の特定とURLの確保
                            if txt.endswith(('市', '町', '村')) or is_tokyo_ku:
                                if not data["municipality"]:
                                    prev = a.find_previous_sibling('a')
                                    if prev and prev.get_text(strip=True).endswith('郡'):
                                        data["municipality"] = prev.get_text(strip=True) + txt
                                    else:
                                        data["municipality"] = txt

                                    # 修正箇所2：urljoinを使って安全に絶対URLへ変換
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
                        m = re.match(r'^((?:.+?郡)?)(.+?(?:市|区|町|村))', loc)
                        if m:
                            res_muni = m.group(1) + m.group(2)
                            if loc.startswith(res_muni + res_muni[-1]): res_muni += res_muni[-1]
                            if loc.startswith(res_muni + '市'): res_muni += '市'
                            data["municipality"] = res_muni

                    # 4. 【合体】自治体データを取得して駅データに統合
                    if data["muni_url"]:
                        if data["muni_url"] not in municipality_cache:
                            print(f"    自治体詳細データを取得中: {data['municipality']}")
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
                    if m_date and not data["open_year"]:
                        data["open_year"] = int(m_date.group(1))
                        if m_date.group(2): data["open_month"] = int(m_date.group(2))
                        if m_date.group(3): data["open_day"] = int(m_date.group(3))

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
                    for a in td.find_all('a'):
                        line_name = a.get_text(strip=True)
                        line_name = re.sub(r'\[[^\]]*\]', '', line_name)
                        if line_name and line_name.endswith('線') and line_name not in data["lines"]:
                            data["lines"].append(line_name)

        if data["min_km"] == float('inf'):
            data["min_km"] = None

    except Exception:
        pass

    return data

def extract_and_count_stations():
    stations_list = []

    headers = {
        "User-Agent": "EkiDleBot/1.0"
    }

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

                        # ーーーこれ以降は、今までの専用処理を完全に維持ーーー
                        m2 = re.match(r"^(.*?)(えき|ていりゅうじょう|しんごうじょう)(?:・|$)", inner_text)
                        if m2:
                            yomi_raw = m2.group(1)
                        else:
                            # 例外的に「えき」が付かない場合
                            yomi_raw = inner_text.split("・")[0]

                        # 記号やスペース、アルファベット等をすべて排除し、純粋な「かな」にする
                        yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", yomi_raw)
                        # 読みのカタカナをひらがなにする
                        # yomi="".join([chr(ord(c)-0x60)if 0x30A1<=ord(c)<=0x30F6 else c for c in yomi])

                if not yomi:
                    # みなとみらい駅など、カッコ自体がない場合のバックアップ
                    yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", display_name)

                if not yomi:
                    continue

                print(f"  詳細データ取得中: {display_name}")
                details = fetch_station_details(wiki_url)

                details.update({"kanji": display_name, "yomi": yomi, "url": wiki_url})
                stations_list.append(details)

                # サーバー負担軽減のための待機時間を0.5秒に短縮
                time.sleep(0.5)

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

    # 今回取得したデータを上書き・追加
    for v in stations_list:
        existing_stations[v["url"]] = v

    result_list = list(existing_stations.values())

    # JSON保存
    with open("stations.json", "w", encoding="utf-8") as f:
        json.dump(result_list, f, ensure_ascii=False, indent=2)

    # ＝＝＝＝＝＝ 文字数ごとの集計 ＝＝＝＝＝＝
    length_counts = {}
    for s in result_list:
        l = len(s["yomi"])
        length_counts[l] = length_counts.get(l, 0) + 1

    print("\n========================================")
    print("抽出完了！文字数ごとの駅数内訳：")

    # 1文字から順番に表示
    for length in sorted(length_counts.keys()):
        print(f" {length:2}文字の駅名 : {length_counts[length]:4} 駅")

    print("----------------------------------------")
    print(f"👉 総合計 : {len(result_list)} 駅を 'stations.json' に保存しました。")
    print("========================================")

if __name__ == "__main__":
    extract_and_count_stations()
