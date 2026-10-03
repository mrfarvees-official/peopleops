import { LogoutButton } from "@/features/auth/logout-button";
import { requireUser } from "@/server/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">PeopleOps</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{user.displayName}</span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </>
  );
}
