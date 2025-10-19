#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Canvas 기반 이모지 렌더링 모듈
Playwright를 사용하여 브라우저에서 이모지를 렌더링하고 PNG로 저장
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)


async def render_emoji_text_to_png(
    text: str,
    output_path: str,
    width: int = 1920,
    height: int = 200,
    font_size: int = 60,
    font_color: str = "white",
    outline_color: str = "black",
    outline_width: int = 3,
    x_position: str = "center",  # "left", "center", "right" or pixel value
    y_position: str = "center",  # "top", "center", "bottom" or pixel value
    font_family: str = '"Noto Sans CJK JP", "Noto Color Emoji", "Noto Sans", sans-serif',
) -> bool:
    """
    이모지가 포함된 텍스트를 Canvas로 렌더링하여 PNG로 저장

    Args:
        text: 렌더링할 텍스트 (이모지 포함 가능)
        output_path: PNG 파일 저장 경로
        width: Canvas 너비 (px)
        height: Canvas 높이 (px)
        font_size: 폰트 크기 (px)
        font_color: 텍스트 색상 (CSS 색상)
        outline_color: 외곽선 색상 (CSS 색상)
        outline_width: 외곽선 너비 (px)
        x_position: 가로 위치 ("left", "center", "right" 또는 px 값)
        y_position: 세로 위치 ("top", "center", "bottom" 또는 px 값)
        font_family: 폰트 패밀리

    Returns:
        bool: 성공 여부
    """
    try:
        # HTML 생성
        html_content = _generate_canvas_html(
            text=text,
            width=width,
            height=height,
            font_size=font_size,
            font_color=font_color,
            outline_color=outline_color,
            outline_width=outline_width,
            x_position=x_position,
            y_position=y_position,
            font_family=font_family,
        )

        # Playwright로 렌더링
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": width, "height": height})

            # HTML 로드
            await page.set_content(html_content)

            # Canvas가 렌더링될 때까지 대기
            await page.wait_for_selector("canvas")
            await asyncio.sleep(0.5)  # 폰트 로딩 대기

            # Canvas 스크린샷 (투명 배경 사용)
            canvas = await page.query_selector("canvas")
            if canvas:
                await canvas.screenshot(path=output_path, type="png", omit_background=True)
                logger.info(f"✅ 이모지 PNG 생성 완료: {output_path}")
                logger.info(f"   텍스트: {text}")
                logger.info(f"   크기: {width}x{height}px")
                success = True
            else:
                logger.error("❌ Canvas 요소를 찾을 수 없습니다")
                success = False

            await browser.close()
            return success

    except Exception as e:
        logger.error(f"❌ 이모지 PNG 생성 실패: {e}", exc_info=True)
        return False


def _generate_canvas_html(
    text: str,
    width: int,
    height: int,
    font_size: int,
    font_color: str,
    outline_color: str,
    outline_width: int,
    x_position: str,
    y_position: str,
    font_family: str,
) -> str:
    """Canvas HTML 생성"""

    # 위치 계산 JavaScript
    x_calc = _get_position_calc(x_position, width, "width")
    y_calc = _get_position_calc(y_position, height, "height")

    html = f"""
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Emoji Canvas Renderer</title>
    <style>
        body {{
            margin: 0;
            padding: 0;
            overflow: hidden;
        }}
        canvas {{
            display: block;
        }}
    </style>
</head>
<body>
    <canvas id="canvas" width="{width}" height="{height}"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        // 투명 배경
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 텍스트 설정
        const text = `{text}`;
        ctx.font = '{font_size}px {font_family}';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 텍스트 크기 측정
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = {font_size};  // 근사치

        // 위치 계산
        const x = {x_calc};
        const y = {y_calc};

        // 외곽선 (검은색)
        if ({outline_width} > 0) {{
            ctx.strokeStyle = '{outline_color}';
            ctx.lineWidth = {outline_width * 2};
            ctx.lineJoin = 'round';
            ctx.strokeText(text, x, y);
        }}

        // 메인 텍스트
        ctx.fillStyle = '{font_color}';
        ctx.fillText(text, x, y);

        console.log('✅ Canvas 렌더링 완료');
        console.log('텍스트:', text);
        console.log('위치:', {{x, y}});
    </script>
</body>
</html>
"""
    return html


def _get_position_calc(position: str, canvas_size: int, dimension: str) -> str:
    """위치 계산 JavaScript 표현식 생성"""
    if position == "left" or position == "top":
        return f"textWidth / 2" if dimension == "width" else "textHeight / 2"
    elif position == "center":
        return f"canvas.{dimension} / 2"
    elif position == "right":
        return f"canvas.{dimension} - textWidth / 2"
    elif position == "bottom":
        return f"canvas.{dimension} - textHeight / 2"
    else:
        # 숫자로 가정
        try:
            return str(int(position))
        except ValueError:
            # 기본값: 중앙
            return f"canvas.{dimension} / 2"


def render_emoji_text_sync(
    text: str,
    output_path: str,
    **kwargs
) -> bool:
    """
    동기 버전의 render_emoji_text_to_png

    Args:
        text: 렌더링할 텍스트
        output_path: PNG 파일 저장 경로
        **kwargs: render_emoji_text_to_png의 다른 인자들

    Returns:
        bool: 성공 여부
    """
    return asyncio.run(render_emoji_text_to_png(text, output_path, **kwargs))
