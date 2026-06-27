import { LuHeader, LuScreen } from "@/components/games/lu-screen";
import { QuickPlay } from "@/components/quick-play";

/** PREVIEW ONLY — no auth; renders the tier-selection state (dummy token). */
export const dynamic = "force-static";

export default function QuickPlayPreview() {
  return (
    <LuScreen>
      <LuHeader icon={<span className="text-xl">⚡</span>} title="لعب سريع" subtitle="انضمّ لطاولة عشوائية فورًا" />
      <div className="mt-3">
        <QuickPlay token="preview" />
      </div>
    </LuScreen>
  );
}
