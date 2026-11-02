import Link from "next/link";
import { signOut } from "@/auth";
import HistoryList from "@/components/HistoryList";

export const metadata = { title: "History · Sticker Camera" };

export default function HistoryPage() {
  return (
    <main className="screen history">
      <header>
        <Link href="/camera">‹ Camera</Link>
        <Link href="/library">Library</Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="link" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <HistoryList />
    </main>
  );
}
