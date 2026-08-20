import argparse
import json
import os
import subprocess
import sys
import tempfile

from faster_whisper import WhisperModel


def transcribe_worker(media: str, model_name: str, cache_dir: str, language: str | None) -> dict:
    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=cache_dir,
    )
    segments, info = model.transcribe(
        media,
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
        condition_on_previous_text=True,
    )
    result_segments = []
    text_parts = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        text_parts.append(text)
        result_segments.append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": text,
        })
    return {
        "transcript": "\n".join(text_parts),
        "language": info.language,
        "languageProbability": round(info.language_probability, 4),
        "duration": round(info.duration, 2),
        "segments": result_segments,
    }


def probe_duration(media: str) -> float:
    process = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", media],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(process.stdout.strip())


def transcribe_chunked(media: str, model_name: str, cache_dir: str) -> dict:
    duration = probe_duration(media)
    chunk_seconds = 30
    all_segments = []
    text_parts = []
    detected_language = ""
    language_probability = 0.0

    with tempfile.TemporaryDirectory(prefix="baokuan-whisper-") as directory:
        chunk_pattern = os.path.join(directory, "chunk-%04d.wav")
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", media, "-ar", "16000", "-ac", "1", "-f", "segment", "-segment_time", str(chunk_seconds), "-c:a", "pcm_s16le", chunk_pattern],
            check=True,
        )
        chunks = sorted(os.path.join(directory, name) for name in os.listdir(directory) if name.endswith(".wav"))
        if not chunks:
            raise RuntimeError("没有从媒体文件中提取到可识别的音轨。")

        for index, chunk in enumerate(chunks):
            worker_args = [
                sys.executable,
                os.path.abspath(__file__),
                chunk,
                "--model", model_name,
                "--cache-dir", cache_dir,
                "--worker",
            ]
            if detected_language:
                worker_args.extend(["--language", detected_language])
            process = subprocess.run(worker_args, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(process.stderr.strip() or process.stdout.strip() or f"第 {index + 1} 段语音识别失败。")
            chunk_result = json.loads(process.stdout)
            if not detected_language:
                detected_language = chunk_result.get("language", "")
                language_probability = float(chunk_result.get("languageProbability", 0))
            offset = index * chunk_seconds
            for segment in chunk_result.get("segments", []):
                all_segments.append({
                    "start": round(offset + float(segment["start"]), 2),
                    "end": round(offset + float(segment["end"]), 2),
                    "text": segment["text"],
                })
            if chunk_result.get("transcript"):
                text_parts.append(chunk_result["transcript"])
            print(f"transcribed={min(offset + chunk_seconds, duration):.0f}s/{duration:.0f}s", file=sys.stderr, flush=True)

    transcript = "\n".join(text_parts).strip()
    if not transcript:
        raise RuntimeError("没有在媒体文件中识别到清晰语音。")
    return {
        "transcript": transcript,
        "language": detected_language,
        "languageProbability": round(language_probability, 4),
        "duration": round(duration, 2),
        "segments": all_segments,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe a media file with faster-whisper.")
    parser.add_argument("media")
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    parser.add_argument("--cache-dir", default=os.environ.get("WHISPER_CACHE_DIR", ".whisper-cache"))
    parser.add_argument("--language", default=None)
    parser.add_argument("--worker", action="store_true")
    args = parser.parse_args()

    if args.worker:
        result = transcribe_worker(args.media, args.model, args.cache_dir, args.language)
    else:
        result = transcribe_chunked(args.media, args.model, args.cache_dir)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
