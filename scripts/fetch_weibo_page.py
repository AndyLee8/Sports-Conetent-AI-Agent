#!/usr/bin/env python3
"""Fetch a visible Weibo page with an authorized browser session.

Cookie values stay inside the process cookie jar and are never printed or saved.
"""

import argparse
import ssl
import sys
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener

import certifi
from yt_dlp import YoutubeDL
from yt_dlp.cookies import load_cookies


ALLOWED_HOSTS = {"s.weibo.com", "weibo.com", "www.weibo.com"}


def allowed_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and (parsed.hostname or "").lower() in ALLOWED_HOSTS


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", default="chrome")
    parser.add_argument("--url", required=True)
    parser.add_argument("--require-hotlist", action="store_true")
    args = parser.parse_args()
    if not allowed_url(args.url):
        raise RuntimeError("只允许读取微博 HTTPS 页面")

    context = ssl.create_default_context(cafile=certifi.where())
    with YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
        jar = load_cookies(None, (args.browser,), ydl)
        opener = build_opener(HTTPCookieProcessor(jar), HTTPSHandler(context=context))
        request = Request(
            args.url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with opener.open(request, timeout=20) as response:
            body = response.read().decode("utf-8", "replace")
            if not allowed_url(response.geturl()) or "Sina Visitor" in body:
                raise RuntimeError("微博要求重新登录或完成访客验证")
            if args.require_hotlist and "pl_top_realtimehot" not in body:
                raise RuntimeError("微博页面没有返回体育热榜表格")
            sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"fetch failed: {error}", file=sys.stderr)
        raise SystemExit(1)
