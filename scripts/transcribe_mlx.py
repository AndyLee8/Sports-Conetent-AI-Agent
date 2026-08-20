import argparse
import json
import sys

import mlx_whisper


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe media with mlx-whisper on Apple silicon.")
    parser.add_argument("media")
    parser.add_argument("--model", default="mlx-community/whisper-small-mlx")
    args = parser.parse_args()

    result = mlx_whisper.transcribe(
        args.media,
        path_or_hf_repo=args.model,
        verbose=False,
        condition_on_previous_text=True,
        word_timestamps=False,
        language=None,
    )
    transcript = str(result.get("text", "")).strip()
    if not transcript:
        raise RuntimeError("没有在媒体文件中识别到清晰语音。")

    segments = []
    for segment in result.get("segments", []):
        text = str(segment.get("text", "")).strip()
        if text:
            segments.append({
                "start": round(float(segment.get("start", 0)), 2),
                "end": round(float(segment.get("end", 0)), 2),
                "text": text,
            })
    duration = max((segment["end"] for segment in segments), default=0)
    print(json.dumps({
        "transcript": transcript,
        "language": result.get("language", ""),
        "languageProbability": 0,
        "duration": duration,
        "segments": segments,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
