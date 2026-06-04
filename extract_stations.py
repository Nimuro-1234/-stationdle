import time
import json
import re
import requests
from bs4 import BeautifulSoup
import datetime
import os

BASE_INDEX_URL = "https://ja.wikipedia.org/wiki/日本の鉄道駅一覧"
SUB_PAGES_ALL = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
                 "さ", "し", "しや-しん", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
                 "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
                 "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
                 "る", "れ", "ろ", "わ", "を", "ん"]

def get_todays_sub_pages():
    weekday = datetime.datetime.today().weekday() # 0:月, 1:火 ... 6:日
    # 46項目を7分割（月〜木は7項目、金〜日は6項目）
    # 動作テストのため、曜日にかかわらず強制的に「2:水曜日」に設定します
    # weekday = 2
    chunks = [
        SUB_PAGES_ALL[0:7],   # 月
        SUB_PAGES_ALL[7:14],  # 火
        SUB_PAGES_ALL[14:21], # 水
        SUB_PAGES_ALL[21:28], # 木
        SUB_PAGES_ALL[28:34], # 金
        SUB_PAGES_ALL[34:40], # 土
        SUB_PAGES_ALL[40:46]  # 日
    ]
    return chunks[weekday], weekday

def fetch_station_details(url):
    details = {"pref": "", "companies": [], "lines": [], "open_year": ""}
    try:
        res = requests.get(url, headers={"User-Agent": "EkiDleBot/1.0"}, timeout=10)
        soup = BeautifulSoup(res.text, "html.parser")
        
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

    SUB_PAGES, weekday_num = get_todays_sub_pages()
    weekdays_str = ["月", "火", "水", "木", "金", "土", "日"]
    print(f"本日は【{weekdays_str[weekday_num]}曜日】の割り当て分（{SUB_PAGES[0]}〜{SUB_PAGES[-1]}）を抽出します。")

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

                if not yomi:
                    # みなとみらい駅など、カッコ自体がない場合のバックアップ
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