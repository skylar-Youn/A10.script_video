#!/usr/bin/env python3
"""Merge saved results classification into a translator project."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from ai_shorts_maker.translator import apply_saved_result_to_project


def load_saved_results(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Saved result file not found: {path}")
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def main() -> None:
    parser = argparse.ArgumentParser(description='Merge saved analysis results into a translator project.')
    parser.add_argument('saved_results', type=Path, help='Path to saved results JSON')
    parser.add_argument('project_id', help='Translator project ID')
    args = parser.parse_args()

    saved_data = load_saved_results(args.saved_results)
    project = apply_saved_result_to_project(args.project_id, saved_data)
    print(f'Updated project {project.id} with saved result data.')


if __name__ == '__main__':
    main()
