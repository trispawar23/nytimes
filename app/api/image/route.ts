import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 5_000_000;

function blockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "0.0.0.0") return true;
  if (h.endsWith(".onion")) return true;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export async function GET(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported scheme" }, { status: 400 });
  }

  if (blockedHostname(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12_000);
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; NYTForYouPrototype/1.0; +https://vercel.com)",
      },
      signal: ac.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "fetch_failed";
    console.error("[api/image] upstream fetch failed", { host: target.hostname, msg });
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(tid);
  }

  if (!upstream.ok) {
    console.error("[api/image] upstream non-OK", {
      host: target.hostname,
      status: String(upstream.status),
    });
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }

  const ct = upstream.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new Response(buf, {
    headers: {
      "Content-Type": ct.split(";")[0].trim(),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
