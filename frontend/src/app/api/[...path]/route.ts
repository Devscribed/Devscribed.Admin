import { NextRequest } from "next/server";

const API_BASE = process.env.API_URL || "http://localhost:5050";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = `${API_BASE}${pathname}${search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const res = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
