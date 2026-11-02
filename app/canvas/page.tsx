import { redirect } from "next/navigation";

// The canvas is now the home page. Keep /canvas working as a link.
export default function CanvasPage() {
  redirect("/");
}
