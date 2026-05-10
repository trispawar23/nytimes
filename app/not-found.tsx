import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#eceae6] p-8 font-sans text-ink">
      <p className="text-lg font-medium">Page not found</p>
      <Link
        href="/"
        className="text-accent underline underline-offset-2 hover:opacity-80"
      >
        Back to For You
      </Link>
    </div>
  );
}
