import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const requestedPath = url.searchParams.get("next") ?? "/";
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/?auth=missing_code", url.origin));
  }
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined
  );
  if (error) return NextResponse.redirect(new URL("/?auth=exchange_failed", url.origin));
  return NextResponse.redirect(new URL(safePath, url.origin));
}
