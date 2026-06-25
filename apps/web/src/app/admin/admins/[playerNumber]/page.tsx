import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagedAdmin } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, PageTitle } from "../../_ui";
import { PermissionGrid, RemoveControl, RoleControl, StatusControl } from "./controls";

export const dynamic = "force-dynamic";

export default async function ManageAdminPage({
  params,
}: {
  params: Promise<{ playerNumber: string }>;
}) {
  const ctx = await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
  const { playerNumber } = await params;
  const pn = Number(playerNumber);
  if (!Number.isInteger(pn)) notFound();

  const a = await getManagedAdmin(pn);
  if (!a) notFound();

  const isSelfSuper = ctx.userId === a.userId && a.role === "SUPER_ADMIN";
  const grantedPlatform = a.permissions
    .filter((p) => p.scope === "platform")
    .map((p) => p.permissionKey);

  return (
    <div className="space-y-5">
      <Link href="/admin/admins" className="text-sm text-muted-foreground hover:underline">
        → كل المشرفين
      </Link>
      <PageTitle
        title={a.username}
        sub={`#${a.playerNumber} · ${a.role === "SUPER_ADMIN" ? "مشرف أعلى" : "مشرف"} · ${
          a.status === "ACTIVE" ? "نشط" : "موقوف"
        }`}
      />

      <Card title="الإجراءات">
        {isSelfSuper ? (
          <p className="text-sm text-muted-foreground">
            هذا حسابك (مشرف أعلى) — إجراءات الإزالة والتخفيض والإيقاف معطّلة لمنع الإقفال
            الذاتي.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <RoleControl playerNumber={a.playerNumber} role={a.role} />
            <StatusControl playerNumber={a.playerNumber} status={a.status} />
            <RemoveControl playerNumber={a.playerNumber} />
          </div>
        )}
      </Card>

      {a.role === "ADMIN" ? (
        <Card title="الصلاحيات (نطاق المنصّة)">
          <PermissionGrid playerNumber={a.playerNumber} granted={grantedPlatform} />
        </Card>
      ) : (
        <Card title="الصلاحيات">
          <p className="text-sm text-muted-foreground">المشرف الأعلى يملك كل الصلاحيات.</p>
        </Card>
      )}
    </div>
  );
}
