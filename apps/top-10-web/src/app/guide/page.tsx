import { redirect } from "next/navigation";
import { GuideIcon } from "@fb/top-10-ui";
import { auth } from "@/auth";
import { LuHeader, LuScreen } from "@/components/lu-screen";
import { HowToPlay } from "./how-to-play";

export const dynamic = "force-dynamic";
export const metadata = { title: "كيف تلعب — توب 10" };

export default async function GuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <LuScreen>
      <LuHeader icon={<GuideIcon size={22} />} title="كيف تلعب" subtitle="كل ما تحتاجه للبدء" />
      <p className="mb-4 mt-2 text-sm leading-relaxed text-[var(--lu-tan)]">اضغط أي بطاقة لعرض تفاصيلها.</p>
      <HowToPlay />
    </LuScreen>
  );
}
