import time
import json
import re
import requests
from bs4 import BeautifulSoup

# 1. 抽出したいWikipediaの「日本の鉄道駅一覧」の子ページ一覧
BASE_INDEX_URL = "https://ja.wikipedia.org/wiki/日本の鉄道駅一覧"
SUB_PAGES = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
             "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
             "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
             "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
             "る", "れ", "ろ", "わ", "を", "ん", "う-え", "く-け", "し-しも",
             "しや-しん", "す-そ", "ち-て", "ふ-ほ", "む-も", "や-わ行"]

def fetch_station_details(url):
    details = {"pref": "", "companies": [], "lines": [], "open_year": ""}
    try:
        res = requests.get(url, headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
        soup = BeautifulSoup(res.text, "html.parser")

        def extract_advanced_station_data(soup):
    # 抽出データの初期値となる辞書を定義
    data = {
        "platforms": 0,           # 面数（最大値）
        "tracks": 0,              # 線路数（最大値）
        "min_km": float('inf'),   # キロ程（最小値）
        "open_month": None,       # 開業月
        "open_day": None,         # 開業日
        "max_passengers": 0,      # 乗車・乗降人員（最大値）
        "municipality": "",       # 所在市区町村（最初のものを採用）
        "companies": [],          # 所属事業者名
        "lines": []               # 所属路線名
    }

    # ページ内のすべてのinfobox（右側の基本情報表）をループ処理
    infoboxes = soup.find_all('table', class_='infobox')

    for infobox in infoboxes:
        for tr in infobox.find_all('tr'):
            th = tr.find('th')
            td = tr.find('td')
            if not th or not td:
                continue

            header = th.get_text(strip=True)
            # td内の改行や<br>を空白に置き換えてテキストを取得
            value = td.get_text(" ", strip=True)

            # ① 所在市区町村 (最初のものを採用。複数区町村や「大町市」等にも対応)
            if header == '所在地' and not data["municipality"]:
                # Wikipediaのリンク(aタグ)を優先的に探索（最も正確に市区町村が独立しているため）
                for a in td.find_all('a'):
                    txt = a.get_text(strip=True)
                    if txt.endswith(('市', '区', '町', '村')):
                        # 前に郡がある場合は結合する（例: 余市郡 + 余市町）
                        prev = a.find_previous_sibling('a')
                        if prev and prev.get_text(strip=True).endswith('郡'):
                            data["municipality"] = prev.get_text(strip=True) + txt
                        else:
                            data["municipality"] = txt
                        break

                # リンクから見つからなかった場合の文字解析フォールバック
                if not data["municipality"]:
                    loc = value.split('・')[0].split(' ')[0] # 新宿駅などの「・」や空白の最初を取る
                    loc = re.sub(r'^(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)', '', loc) # 都道府県を排除

                    # 郡（任意）+ 市区町村を正規表現で抽出
                    m = re.match(r'^((?:.+?郡)?)(.+?(?:市|区|町|村))', loc)
                    if m:
                        res = m.group(1) + m.group(2)
                        # 四日市市、廿日市市など、末尾の文字が連続・重複する場合の補正
                        if loc.startswith(res + res[-1]):
                            res += res[-1]
                        # 大町市など、途中に「町」を含み、末尾が「市」の補正
                        if loc.startswith(res + '市'):
                            res += '市'
                        data["municipality"] = res

            # ② ホーム面数・線路数 (最大値採用)
            elif 'ホーム' in header:
                matches = re.findall(r'(\d+)\s*面\s*(\d+)\s*線', value)
                for m, s in matches:
                    data["platforms"] = max(data["platforms"], int(m))
                    data["tracks"] = max(data["tracks"], int(s))

            # ③ キロ程 (最小値採用)
            elif 'キロ程' in header:
                matches = re.findall(r'(\d+(?:\.\d+)?)', value)
                for km_str in matches:
                    data["min_km"] = min(data["min_km"], float(km_str))

            # ④ 開業月・開業日
            elif '開業年月日' in header:
                if data["open_month"] is None:
                    m = re.search(r'(\d+)月(\d+)日', value)
                    if m:
                        data["open_month"] = int(m.group(1))
                        data["open_day"] = int(m.group(2))

            # ⑤ 乗車人員・乗降人員 (最大値採用、注釈や年は排除)
            elif '乗車人員' in header or '乗降人員' in header:
                # カンマを取り除き、純粋に「数字 + 人」の部分だけを抽出
                clean_val = value.replace(',', '')
                matches = re.findall(r'(\d+)\s*人', clean_val)
                for num_str in matches:
                    data["max_passengers"] = max(data["max_passengers"], int(num_str))

            # ⑥ 所属事業者名 (「（）」の中身は排除)
            elif '所属事業者' in header:
                clean_val = re.sub(r'（[^）]*）|\([^)]*\)|\[[^\]]*\]', '', value)
                # 空白や「・」で分割してリスト化
                comps = [c.strip() for c in re.split(r'\s|・', clean_val) if c.strip()]
                for c in comps:
                    if c and c not in data["companies"]:
                        data["companies"].append(c)

            # ⑦ 所属路線名 (注釈[]の中身を排除)
            elif '所属路線' in header or header == '路線':
                for a in td.find_all('a'):
                    line_name = a.get_text(strip=True)
                    line_name = re.sub(r'\[[^\]]*\]', '', line_name) # 注釈を排除
                    if line_name and line_name.endswith('線') and line_name not in data["lines"]:
                        data["lines"].append(line_name)

    # 最小キロ程が初期値のまま（見つからなかった）場合は None に戻す
    if data["min_km"] == float('inf'):
        data["min_km"] = None

    return data

        for box in soup.find_all("table", class_="infobox"):
            for row in box.find_all("tr"):
                th = row.find("th")
                td = row.find("td")
                if not th or not td: continue

                th_text = th.get_text(strip=True)
                td_text = re.sub(r'\[.*?\]', '', td.get_text(separator=" ", strip=True))

                if "所在地" in th_text and not details["pref"]:
                    td_text_clean = td_text.replace(" ", "")
                    m = re.match(r'(東京都|北海道|(?:京都|大阪)府|.{2,3}県)', td_text_clean)
                    if m:
                        details["pref"] = m.group(1)

                elif "事業者" in th_text:
                    # 箇条書きでない場合も考慮し、改行や中黒で分割してリスト化する
                    td_html = str(td).replace("<br/>", "・").replace("<br>", "・")
                    td_soup = BeautifulSoup(td_html, "html.parser")
                    comps = [re.sub(r'\[.*?\]', '', li.get_text(strip=True)) for li in td_soup.find_all("li")]
                    if not comps:
                        comps = td_soup.get_text(separator="・").split("・")

                    for c in comps:
                        # カッコの中身（通称）を消去して正式名称だけを抽出
                        c_clean = re.sub(r'（.*?）|\(.*?\)', '', c).strip()
                        if c_clean and c_clean not in details["companies"]:
                            details["companies"].append(c_clean)

                elif "路線" in th_text and "数" not in th_text:
                    lines = [a.get_text(strip=True) for a in td.find_all("a") if "Template:" not in a.get("href", "")]
                    if not lines: lines = [re.sub(r'[■●□○]', '', td_text).strip()]
                    for l in lines:
                        if l and l not in details["lines"]:
                            details["lines"].append(l)

                elif "開業年月日" in th_text:
                    m_year = re.search(r'(\d{4})年', td_text)
                    if m_year:
                        year_val = int(m_year.group(1))
                        # 抽出した年が今までのものより小さければ（古ければ）更新する
                        if not details["open_year"] or year_val < int(details["open_year"]):
                            details["open_year"] = str(year_val)

    except Exception:
        pass
    return details

def extract_and_count_stations():
    stations_list = []

    headers = {
        "User-Agent": "EkiDleBot/1.0"
    }

    print("Wikipediaからの駅名抽出（全文字数・例外対応版）を開始します...")

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
                text = li.get_text()
                match = re.search(r"（(.+?)）", text) # カッコの中身を抽出

                if match:
                    inner_text = match.group(1)
                    # 「えき」「ていりゅうじょう」等の直前までを駅のヨミとして切り出す
                    # これにより「栂・美木多駅（とが・みきたえき）」等から路線名部分を除外する
                    m2 = re.match(r"^(.*?)(えき|ていりゅうじょう|しんごうじょう)(?:・|$)", inner_text)
                    if m2:
                        yomi_raw = m2.group(1)
                    else:
                        # 例外的に「えき」が付かない場合
                        yomi_raw = inner_text.split("・")[0]

                    # 記号（・）やスペースをすべて排除し、純粋な「かな」にする
                    yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", yomi_raw)
                else:
                    # みなとみらい駅など、カッコ自体がない場合は表示名から記号を抜く
                    yomi = re.sub(r"[^ぁ-んァ-ヶー]", "", display_name)

                if not yomi:
                    continue

                print(f"  詳細データ取得中: {display_name}")
                details = fetch_station_details(wiki_url)

                stations_list.append({
                    "kanji": display_name,
                    "yomi": yomi,
                    "url": wiki_url,
                    "pref": details["pref"],
                    "companies": details["companies"],
                    "lines": details["lines"],
                    "open_year": details["open_year"]
                })

                # サーバー負担軽減のための待機時間を0.5秒に短縮
                time.sleep(0.5)

        except Exception as e:
            print(f"エラーが発生しました: {e}")

        time.sleep(2.0) # サーバー負担軽減

    # 重複排除
    unique_stations = {v["url"]: v for v in stations_list}.values()
    result_list = list(unique_stations)

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
