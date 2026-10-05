import type { SessionUser } from "@/platform/domain/auth";
import { getPbac } from "@/server/pbac";
import { MENU } from "./menu";
import { ProfileMenu } from "./profile-menu";
import { toProfileMenuUser } from "./profile-user";
import { SidebarNav, type NavSection } from "./sidebar-nav";

export async function Sidebar({ user }: { user: SessionUser }) {
  // One policy load decides every menu item the user may see.
  const guarded = MENU.filter((i) => i.requires);
  const decisions = await getPbac().authorizeMany(
    user,
    guarded.map((i) => ({
      action: i.requires!.action,
      resource: { type: i.requires!.resource, tenantId: user.tenantId },
    })),
  );
  const allowed = new Set(
    guarded.filter((_, n) => decisions[n].allowed).map((i) => i.href),
  );

  const sections: NavSection[] = [];
  for (const item of MENU) {
    if (item.requires && !allowed.has(item.href)) continue;
    let s = sections.find((x) => x.title === item.section);
    if (!s) sections.push((s = { title: item.section, items: [] }));
    s.items.push({ label: item.label, href: item.href });
  }

  return (
    <aside className="border-b bg-surface md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="md:flex-1 md:overflow-y-auto">
        <SidebarNav sections={sections} />
      </div>
      {/* Bottom of the sidebar (on small screens it lives in the header only) */}
      <div className="hidden border-t p-3 md:block">
        <ProfileMenu user={toProfileMenuUser(user)} opens="up" wide />
      </div>
    </aside>
  );
}
