import { redirect } from "next/navigation";

// About now opens as a panel over the canvas. Keep /about working as a link.
export default function AboutPage() {
  redirect("/canvas?about");
}
