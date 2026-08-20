import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ALLOWED_HOSTS = new Set(["s.weibo.com", "weibo.com", "www.weibo.com"]);

export function isWeiboPage(url: URL) {
  return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}

export async function fetchWeiboPageWithBrowser(url: URL, requireHotlist = false) {
  if (!isWeiboPage(url)) throw new Error("只允许读取微博 HTTPS 页面。");
  const browser = process.env.WEIBO_BROWSER_COOKIES?.trim();
  const python = process.env.WEIBO_COOKIE_PYTHON_PATH?.trim();
  if (!browser || !python) throw new Error("本地微博浏览器会话未配置。");
  const args = [path.join(process.cwd(), "scripts/fetch_weibo_page.py"), "--browser", browser, "--url", url.toString()];
  if (requireHotlist) args.push("--require-hotlist");
  const { stdout } = await execFileAsync(python, args, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  return stdout;
}
