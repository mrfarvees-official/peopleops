import { requireUser } from "@/server/session";

export default async function Page() {
  const user = await requireUser();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Welcome, {user.displayName}</h1>
      <p className="text-sm text-gray-500">{user.roles.join(", ")}</p>
    </main>
  );
}
