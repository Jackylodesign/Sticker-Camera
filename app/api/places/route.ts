import { searchPlaces } from "@/lib/geocode";
import { requireOwner } from "@/lib/owner";

// Owner only: search places by name, e.g. GET /api/places?q=Mong%20Kok
// Used in Library to set where an older sticker was taken.
export async function GET(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return Response.json({ error: "Type 2–100 characters" }, { status: 400 });
  return Response.json(await searchPlaces(q));
}
