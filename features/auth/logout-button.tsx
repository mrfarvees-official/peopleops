import { logoutAction } from "./actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded border px-3 py-1 text-sm hover:bg-surface-2"
      >
        Log out
      </button>
    </form>
  );
}
