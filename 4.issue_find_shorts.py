#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from playwright.sync_api import sync_playwright
import json
import pandas as pd
from datetime import datetime
import re


def clean_text(text):
    """텍스트 정리 - 특수문자 제거, 공백 정리"""
    if not text:
        return ""
    # 여러 공백을 하나로
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def classify_humor_category(title, category=""):
    """
    유머 게시물을 세부 분야로 분류

    분류:
    - 일상유머: 일상생활, 경험담
    - 짤방/움짤: 이미지, GIF, 사진
    - 드립/말장난: 언어유희, 말장난
    - 동물: 고양이, 강아지, 동물
    - 연예/방송: 연예인, TV, 영화
    - 게임: 게임 관련
    - 스포츠: 축구, 야구, 스포츠
    - 시사패러디: 시사, 정치 패러디
    - 썰/후기: 경험담, 후기
    - 기타유머: 분류되지 않는 유머
    """

    title_lower = title.lower()
    category_lower = category.lower()
    combined = (title + " " + category).lower()

    # 각 카테고리별 키워드 정의
    categories = {
        '동물': ['고양이', '강아지', '냥이', '멍멍이', '반려동물', '펫', 'pet', '냥', '멍', '동물', '새', '햄스터'],
        '짤방/움짤': ['짤', '움짤', 'gif', '사진', '이미지', '인증', '움직이는', '사진첩', '갤러리'],
        '게임': ['게임', '롤', 'lol', '리그오브레전드', '배그', '오버워치', '스팀', 'pc방', '모바일게임', '겜'],
        '연예/방송': ['연예인', '아이돌', '배우', '방송', 'tv', '드라마', '영화', '예능', '넷플릭스', '유튜버', '스트리머'],
        '스포츠': ['야구', '축구', '농구', '배구', '손흥민', '메시', '호날두', '스포츠', '운동', '올림픽'],
        '썰/후기': ['썰', '후기', '경험담', '실화', '있었던', '겪은', '당한', '만난', 'ㄹㅇ', '레전드'],
        '드립/말장난': ['드립', '말장난', '언어유희', '이름드립', '개드립', '아재개그', 'ㅋㅋ', 'ㅎㅎ'],
        '시사패러디': ['시사', '뉴스', '정치', '대통령', '국회', '정부', '패러디', '풍자'],
        '일상유머': ['일상', '직장', '회사', '학교', '알바', '편의점', '카페', '음식', '요리', '맛집']
    }

    # 우선순위에 따라 분류
    for cat_name, keywords in categories.items():
        for keyword in keywords:
            if keyword in combined:
                return cat_name

    return '기타유머'


def is_shorts_suitable(title, content=""):
    """
    쇼츠 제작에 적합한 주제인지 판단

    적합 기준:
    - 흥미로운 이슈 (논란, 화제)
    - 시각적 표현 가능 (사진/영상 관련)
    - 감정적 반응 유발 (웃김, 감동, 놀라움)
    - 정보성 (꿀팁, 신기한 사실)
    """

    # 제외할 키워드 (광고성, 스팸성, 민감한 정치 등)
    exclude_keywords = [
        '광고', '홍보', '구매', '판매', '알바', '모집',
        '혐오', '비하', '욕설', '선정적'
    ]

    # 포함하면 좋은 키워드 (쇼츠 적합)
    include_keywords = [
        '썰', '후기', '레전드', '실화', 'ㄷㄷ', 'ㅋㅋ',
        '놀라운', '신기한', '대박', '충격', '화제',
        '최근', '요즘', '근황', 'TMI', '팁', '꿀팁',
        '반응', '인기', 'HOT', '베스트', '개념글',
        '사진', '영상', 'gif', '움짤'
    ]

    title_lower = title.lower()

    # 제외 키워드 체크
    for keyword in exclude_keywords:
        if keyword in title:
            return False

    # 포함 키워드 체크 (가중치)
    score = 0
    for keyword in include_keywords:
        if keyword in title or keyword in title_lower:
            score += 1

    # 이모티콘이나 특수문자가 많으면 감정 표현이 있다고 판단
    emoji_count = len(re.findall(r'[ㅋㅎㄷㄹㅇ!?]', title))
    if emoji_count >= 2:
        score += 1

    # 제목 길이가 적당하면 가산점
    if 10 <= len(title) <= 50:
        score += 1

    return score >= 2


def scrape_dcinside():
    """
    DC인사이드 개념글/실베 스크래핑
    """
    print("\n🔍 DC인사이드 스크래핑 시작...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        issues = []

        try:
            # 메인 페이지 접속
            page.goto('https://gall.dcinside.com/', wait_until='networkidle', timeout=30000)
            page.wait_for_timeout(2000)

            # 개념글 제목 추출
            titles = page.locator('strong.tit').all()

            for idx, title_elem in enumerate(titles[:30]):  # 최대 30개
                try:
                    title = clean_text(title_elem.inner_text())

                    if not title or len(title) < 5:
                        continue

                    # 부모 요소에서 갤러리명과 날짜 찾기
                    parent = title_elem.locator('xpath=../..').first

                    gallery = ""
                    date = ""

                    # info div에서 갤러리명과 날짜 추출
                    info_divs = parent.locator('.info span').all()
                    if len(info_divs) >= 2:
                        gallery = clean_text(info_divs[0].inner_text())
                        date = clean_text(info_divs[1].inner_text())

                    # 링크 추출 (여러 방법 시도)
                    link = ""

                    # 방법 1: title을 포함한 a 태그 찾기
                    title_parent_link = title_elem.locator('xpath=ancestor::a').first
                    if title_parent_link.count() > 0:
                        href = title_parent_link.get_attribute('href')
                        if href:
                            if href.startswith('http'):
                                link = href
                            elif href.startswith('/'):
                                link = 'https://gall.dcinside.com' + href

                    # 방법 2: parent의 a 태그 찾기
                    if not link:
                        link_elem = parent.locator('a').first
                        if link_elem.count() > 0:
                            href = link_elem.get_attribute('href')
                            if href:
                                if href.startswith('http'):
                                    link = href
                                elif href.startswith('/'):
                                    link = 'https://gall.dcinside.com' + href

                    issue = {
                        'platform': 'DC인사이드',
                        'category': gallery,
                        'title': title,
                        'date': date,
                        'link': link,
                        'shorts_suitable': is_shorts_suitable(title),
                        'humor_category': classify_humor_category(title, gallery),
                        'scraped_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }

                    issues.append(issue)

                except Exception as e:
                    print(f"  ⚠️  개별 항목 파싱 오류: {e}")
                    continue

            print(f"✅ DC인사이드: {len(issues)}개 이슈 발견")

        except Exception as e:
            print(f"❌ DC인사이드 스크래핑 오류: {e}")

        finally:
            browser.close()

        return issues


def scrape_fmkorea():
    """
    FM Korea 베스트 게시물 스크래핑
    """
    print("\n🔍 FM Korea 스크래핑 시작...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        issues = []

        try:
            # 베스트 페이지 접속
            page.goto('https://www.fmkorea.com/best', wait_until='networkidle', timeout=30000)
            page.wait_for_timeout(2000)

            # 게시물 목록 추출
            articles = page.locator('.li_best_wrapper, .fm_best_widget li, article').all()

            for idx, article in enumerate(articles[:30]):  # 최대 30개
                try:
                    # 제목 및 링크 추출 (여러 선택자 시도)
                    title = ""
                    link = ""
                    title_selectors = [
                        '.title a',
                        'a.hx',
                        '.hotdeal_title a',
                        'a[href*="/board/"]',
                        'a[href*="/hot/"]'
                    ]

                    title_link_elem = None
                    for selector in title_selectors:
                        elem = article.locator(selector).first
                        if elem.count() > 0:
                            title = clean_text(elem.inner_text())
                            if title and len(title) >= 5:
                                title_link_elem = elem
                                break

                    if not title or len(title) < 5:
                        continue

                    # 제목 요소에서 링크 추출
                    if title_link_elem:
                        href = title_link_elem.get_attribute('href')
                        if href:
                            if href.startswith('http'):
                                link = href
                            elif href.startswith('/'):
                                link = 'https://www.fmkorea.com' + href

                    # 링크가 없으면 article의 첫 번째 a 태그에서 추출
                    if not link:
                        link_elem = article.locator('a').first
                        if link_elem.count() > 0:
                            href = link_elem.get_attribute('href')
                            if href:
                                if href.startswith('http'):
                                    link = href
                                elif href.startswith('/'):
                                    link = 'https://www.fmkorea.com' + href

                    # 카테고리 추출
                    category = "베스트"
                    category_elem = article.locator('.category, .category_wrapper').first
                    if category_elem.count() > 0:
                        category = clean_text(category_elem.inner_text())

                    # 날짜 추출
                    date = ""
                    date_elem = article.locator('.date, .time, .regdate').first
                    if date_elem.count() > 0:
                        date = clean_text(date_elem.inner_text())

                    issue = {
                        'platform': 'FM Korea',
                        'category': category,
                        'title': title,
                        'date': date,
                        'link': link,
                        'shorts_suitable': is_shorts_suitable(title),
                        'humor_category': classify_humor_category(title, category),
                        'scraped_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }

                    issues.append(issue)

                except Exception as e:
                    print(f"  ⚠️  개별 항목 파싱 오류: {e}")
                    continue

            print(f"✅ FM Korea: {len(issues)}개 이슈 발견")

        except Exception as e:
            print(f"❌ FM Korea 스크래핑 오류: {e}")

        finally:
            browser.close()

        return issues


def select_platform():
    """
    사용자가 플랫폼을 선택하도록 함
    """
    print("\n" + "="*60)
    print("📱 쇼츠 제작용 이슈 찾기")
    print("="*60)
    print("\n커뮤니티 플랫폼을 선택하세요:")
    print("1. DC인사이드")
    print("2. FM Korea")
    print("3. 전체 (모든 플랫폼)")
    print("="*60)

    while True:
        choice = input("\n선택 (1-3): ").strip()

        if choice == '1':
            return ['dcinside']
        elif choice == '2':
            return ['fmkorea']
        elif choice == '3':
            return ['dcinside', 'fmkorea']
        else:
            print("❌ 잘못된 선택입니다. 1-3 중에서 선택하세요.")


def main():
    # 플랫폼 선택
    platforms = select_platform()

    all_issues = []

    # 선택한 플랫폼별 스크래핑
    for platform in platforms:
        if platform == 'dcinside':
            issues = scrape_dcinside()
        elif platform == 'fmkorea':
            issues = scrape_fmkorea()
        else:
            continue

        all_issues.extend(issues)

    if not all_issues:
        print("\n❌ 수집된 이슈가 없습니다.")
        return

    # 쇼츠 적합한 주제만 필터링
    suitable_issues = [issue for issue in all_issues if issue['shorts_suitable']]

    print(f"\n📊 총 {len(all_issues)}개 이슈 중 {len(suitable_issues)}개가 쇼츠 제작에 적합합니다.")

    # 유머 분야별로 그룹화
    from collections import defaultdict
    humor_by_category = defaultdict(list)

    for issue in suitable_issues:
        humor_cat = issue.get('humor_category', '기타유머')
        humor_by_category[humor_cat].append(issue)

    # 각 분야별 TOP 10 추출
    category_top10 = {}
    print("\n🎭 유머 분야별 TOP 10:")
    print("="*80)

    for cat_name in sorted(humor_by_category.keys()):
        issues_in_cat = humor_by_category[cat_name]
        top10 = issues_in_cat[:10]
        category_top10[cat_name] = top10

        print(f"\n【{cat_name}】 ({len(issues_in_cat)}개 중 상위 {len(top10)}개)")
        print("-"*80)

        for idx, issue in enumerate(top10, 1):
            print(f"{idx}. {issue['title'][:60]}")
            print(f"   📰 {issue['platform']} - {issue['category']}")
            if issue.get('link'):
                print(f"   🔗 {issue['link']}")

    # 전체 상위 10개 선택 (쇼츠 적합한 것 우선)
    top_10_suitable = suitable_issues[:10] if len(suitable_issues) >= 10 else suitable_issues

    # 부족하면 전체에서 채움
    if len(top_10_suitable) < 10:
        remaining = [issue for issue in all_issues if not issue['shorts_suitable']]
        needed = 10 - len(top_10_suitable)
        top_10_suitable.extend(remaining[:needed])

    print(f"\n\n🎯 전체 쇼츠 제작 추천 주제 TOP {len(top_10_suitable)}:")
    print("="*80)

    for idx, issue in enumerate(top_10_suitable, 1):
        suitable_mark = "⭐" if issue['shorts_suitable'] else "  "
        humor_cat = issue.get('humor_category', '미분류')
        print(f"\n{idx}. {suitable_mark} [{humor_cat}] {issue['category']}")
        print(f"   📌 제목: {issue['title']}")
        print(f"   📰 출처: {issue['platform']}")
        print(f"   🔗 링크: {issue.get('link', '링크 없음')}")
        if issue.get('date'):
            print(f"   📅 날짜: {issue['date']}")

    # 결과 저장
    date_str = datetime.now().strftime('%Y%m%d_%H%M%S')

    # JSON 저장 (전체)
    json_filename = f'issues_all_{date_str}.json'
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(all_issues, f, ensure_ascii=False, indent=2)
    print(f"\n💾 전체 결과가 '{json_filename}' 파일로 저장되었습니다.")

    # JSON 저장 (분야별 TOP 10)
    json_category_filename = f'issues_by_category_{date_str}.json'
    with open(json_category_filename, 'w', encoding='utf-8') as f:
        json.dump(category_top10, f, ensure_ascii=False, indent=2)
    print(f"💾 분야별 TOP 10이 '{json_category_filename}' 파일로 저장되었습니다.")

    # 엑셀 저장
    excel_filename = f'issues_{date_str}.xlsx'
    with pd.ExcelWriter(excel_filename, engine='openpyxl') as writer:
        # 전체 이슈
        df_all = pd.DataFrame(all_issues)
        cols = ['platform', 'category', 'title', 'date', 'humor_category', 'shorts_suitable', 'link', 'scraped_at']
        cols = [c for c in cols if c in df_all.columns]
        df_all = df_all[cols]

        # 컬럼명을 한글로 변경
        df_all = df_all.rename(columns={
            'platform': '출처',
            'category': '카테고리',
            'title': '제목',
            'date': '날짜',
            'humor_category': '유머분야',
            'shorts_suitable': '쇼츠적합',
            'link': '링크',
            'scraped_at': '수집시간'
        })
        df_all.to_excel(writer, sheet_name='전체', index=False)

        # 전체 TOP 10
        df_top10 = pd.DataFrame(top_10_suitable)
        top10_cols = [c for c in cols if c in df_top10.columns]
        df_top10 = df_top10[top10_cols]
        df_top10 = df_top10.rename(columns={
            'platform': '출처',
            'category': '카테고리',
            'title': '제목',
            'date': '날짜',
            'humor_category': '유머분야',
            'shorts_suitable': '쇼츠적합',
            'link': '링크',
            'scraped_at': '수집시간'
        })
        df_top10.to_excel(writer, sheet_name='TOP10_전체추천', index=False)

        # 각 분야별 TOP 10 시트 생성
        for cat_name, cat_issues in category_top10.items():
            if cat_issues:
                df_cat = pd.DataFrame(cat_issues)
                cat_cols = [c for c in cols if c in df_cat.columns]
                df_cat = df_cat[cat_cols]
                df_cat = df_cat.rename(columns={
                    'platform': '출처',
                    'category': '카테고리',
                    'title': '제목',
                    'date': '날짜',
                    'humor_category': '유머분야',
                    'shorts_suitable': '쇼츠적합',
                    'link': '링크',
                    'scraped_at': '수집시간'
                })
                # 시트명에서 금지된 문자 제거 (엑셀 시트명에 사용 불가: : \ / ? * [ ])
                safe_name = cat_name.replace('/', '_').replace('\\', '_').replace(':', '_')
                safe_name = safe_name.replace('?', '').replace('*', '').replace('[', '').replace(']', '')
                # 시트명은 31자 제한이 있으므로 짧게
                sheet_name = f"{safe_name[:20]}_TOP10"
                df_cat.to_excel(writer, sheet_name=sheet_name, index=False)

        # 쇼츠 적합 전체
        if suitable_issues:
            df_suitable = pd.DataFrame(suitable_issues)
            suitable_cols = [c for c in cols if c in df_suitable.columns]
            df_suitable = df_suitable[suitable_cols]
            df_suitable = df_suitable.rename(columns={
                'platform': '출처',
                'category': '카테고리',
                'title': '제목',
                'date': '날짜',
                'humor_category': '유머분야',
                'shorts_suitable': '쇼츠적합',
                'link': '링크',
                'scraped_at': '수집시간'
            })
            df_suitable.to_excel(writer, sheet_name='쇼츠적합_전체', index=False)

    print(f"💾 엑셀 결과가 '{excel_filename}' 파일로 저장되었습니다.")

    # 분야별 통계 출력
    print("\n📈 유머 분야별 통계:")
    print("="*50)
    for cat_name in sorted(humor_by_category.keys()):
        count = len(humor_by_category[cat_name])
        print(f"  {cat_name}: {count}개")

    print("\n✨ 완료!")


if __name__ == "__main__":
    main()
