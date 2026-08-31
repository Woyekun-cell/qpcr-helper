import { deleteAuthenticatedProject } from "@/lib/persistence";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    if (!await deleteAuthenticatedProject(id)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
  }
}
