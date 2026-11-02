import { redirect } from "next/navigation";

// About opens as a panel over the canvas on the home page. Keep /about working as a link.
export default function AboutPage() {
  redirect("/?about");
}
