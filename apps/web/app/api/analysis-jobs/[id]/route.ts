import { guestJobRepository } from "@/lib/guest-repository";
import { readAuthenticatedJob } from "@/lib/persistence";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const authenticated = await readAuthenticatedJob(id);
  if (authenticated) return NextResponse.json(authenticated, { headers: { "Cache-Control": "no-store" } });
  const token = request.headers.get("x-capability-token") ?? "";
  const guest = await guestJobRepository.read(id, token);
  if (!guest) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    id: guest.id,
    status: guest.status,
    result: guest.result,
    createdAt: guest.createdAt,
    expiresAt: guest.expiresAt
  }, { headers: { "Cache-Control": "no-store" } });
}
