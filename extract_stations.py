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
                # 「湖遊館新駅駅」の末尾の駅だけを消して「湖遊館新駅」にする
                kanji_raw = a_tag.get_text()
                display_name = re.sub(r"(駅|停留場|信号場)$", "", kanji_raw)

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

                stations_list.append({
                    "kanji": display_name,
                    "yomi": yomi,
                    "url": wiki_url
                })

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