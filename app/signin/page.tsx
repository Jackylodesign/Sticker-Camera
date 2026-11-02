import { signIn } from "@/auth";

export const metadata = { title: "Sign in · Sticker Camera" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  // Go back to the page you came from. (Auth.js only allows pages on this site.)
  const redirectTo = callbackUrl ?? "/";

  return (
    <main className="screen centered">
      <h1>Sticker Camera</h1>
      <p>This is a private app. Sign in to continue.</p>
      {error && (
        <p className="notice">
          {error === "AccessDenied"
            ? "That Google account isn't allowed to use this app."
            : "Sign-in didn't work. Please try again."}
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button className="button primary" type="submit">
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
