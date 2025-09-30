#!/bin/bash
set -e

MAX_LINES=500 #700
REFACTOR_THRESHOLD=700 #1000

# JSON 입력을 읽어서 파일 경로 추출
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // ""')

# 파일 경로가 제공되지 않은 경우 종료
if [ -z "$file_path" ] || [ "$file_path" = "null" ]; then
    exit 0
fi

# 파일이 존재하지 않는 경우 종료
if [ ! -f "$file_path" ]; then
    exit 0
fi

# TypeScript 파일이 아닌 경우 종료
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
    exit 0
fi

# 파일 전체 줄 수 체크
total_lines=$(wc -l < "$file_path")

if [ $total_lines -gt $REFACTOR_THRESHOLD ]; then
    # 1000줄 초과시 완전 차단
    echo "{\"decision\": \"block\", \"reason\": \"TypeScript file has $total_lines lines, exceeding $REFACTOR_THRESHOLD line limit. Please refactor into smaller files.\"}"
elif [ $total_lines -gt $MAX_LINES ]; then
    # 500~1000줄 사이: 자동 리팩토링 제안
    echo "{\"decision\": \"approve\", \"reason\": \"TypeScript file has $total_lines lines (>${MAX_LINES}). Consider refactoring into smaller files for better maintainability. File modification is allowed but splitting into smaller components is recommended.\"}"
fi