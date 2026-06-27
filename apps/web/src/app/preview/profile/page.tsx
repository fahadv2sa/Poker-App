import { ProfileScreen } from "@/components/games/profile-screen";

/** PREVIEW ONLY — no auth/DB; mock identity to judge the profile redesign. */
export const dynamic = "force-static";

export default function ProfilePreview() {
  return (
    <ProfileScreen
      displayName="فهد"
      subtitle="fahad · #1042"
      avatarUrl={null}
      avatarSeed="fahad"
      level={12}
      likes={128}
      rows={[
        ["عدد الكوينز", "12,450 كوين"],
        ["إجمالي ربح الكوينز", "84,200 كوين"],
        ["إجمالي خسارة الكوينز", "61,780 كوين"],
        ["أكبر رهان رابح", "9,600 كوين"],
        ["أكبر رهان خاسر", "5,400 كوين"],
      ]}
      currentNickname="فهد"
      hasAvatar={false}
    />
  );
}
