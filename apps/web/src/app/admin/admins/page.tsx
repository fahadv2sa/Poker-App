import Link from "next/link";
import { listAdmins } from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";
import { Card, PageTitle, TableWrap } from "../_ui";
import { AppointForm } from "./controls";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  await requireAdminCan(PERMISSIONS.ADMIN_MANAGE);
  const admins = await listAdmins();

  return (
    <div className="space-y-5">
      <PageTitle title="المشرفون" sub="تعيين المشرفين وإدارة الصلاحيات" />

      <Card title="تعيين مشرف">
        <AppointForm />
        <p className="mt-2 text-xs text-muted-foreground">
          بإدخال رقم اللاعب. «مشرف أعلى» يملك كل الصلاحيات؛ «مشرف» يُمنح صلاحيات محدّدة.
        </p>
      </Card>

      <Card title={`المشرفون (${admins.length})`}>
        <TableWrap>
          <thead className="bg-white/5 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-bold">المستخدم</th>
              <th className="px-3 py-2 font-bold">الصلاحية</th>
              <th className="px-3 py-2 font-bold">الحالة</th>
              <th className="px-3 py-2 font-bold">الأذونات</th>
              <th className="px-3 py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.userId} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">
                  <Link href={`/admin/admins/${a.playerNumber}`} className="font-bold text-primary hover:underline">
                    {a.username}
                  </Link>{" "}
                  <span className="num text-muted-foreground">#{a.playerNumber}</span>
                </td>
                <td className="px-3 py-2">{a.role === "SUPER_ADMIN" ? "مشرف أعلى" : "مشرف"}</td>
                <td className="px-3 py-2">{a.status === "ACTIVE" ? "نشط" : "موقوف"}</td>
                <td className="num px-3 py-2">
                  {a.role === "SUPER_ADMIN" ? "الكل" : a.permissions.length}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/admins/${a.playerNumber}`} className="text-sm text-primary hover:underline">
                    إدارة
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
