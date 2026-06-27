import { StatsView, type StatsVM } from "@/components/games/stats-view";

/** PREVIEW ONLY — no auth/DB; mock view-model to judge the stats redesign. */
export const dynamic = "force-static";

const vm: StatsVM = {
  displayName: "فهد",
  playerNumber: 1042,
  avatarSrc: null,
  hue: 28,
  level: 12,
  xp: 7150,
  progress: 0.62,
  xpToNext: 540,
  core: [
    { icon: "⚽", label: "المباريات", value: "184", tone: "cream" },
    { icon: "🏆", label: "الانتصارات", value: "96", tone: "gold" },
    { icon: "💔", label: "الخسارات", value: "71", tone: "lose" },
    { icon: "🎯", label: "نسبة الفوز", value: "52%", tone: "gold" },
    { icon: "🪙", label: "صافي الربح/الخسارة", value: "+8,420", tone: "gold" },
    { icon: "🚪", label: "مرات الانسحاب", value: "17", tone: "cream" },
  ],
  analysis: {
    bars: [
      { label: "نجاح الخداع", r: 0.64, display: "64%", tone: "gold" },
      { label: "معدّل الخداع", r: 0.31, display: "31%", tone: "gold" },
      { label: "نسبة الوصول للكشف", r: 0.48, display: "48%", tone: "gold" },
      { label: "نسبة الانسحاب", r: 0.22, display: "22%", tone: "ember" },
      { label: "جرأة الرهان", r: 0.57, display: "57%", tone: "gold" },
    ],
    luck: 0.18,
    biggestPot: "12,400",
    longestWinStreak: "7",
  },
  badges: [
    { icon: "🃏", nameAr: "المخادع", descAr: "نجحت في خداع خصومك مرّات كثيرة", unlocked: true },
    { icon: "🍀", nameAr: "المحظوظ", descAr: "فزت بأيدٍ ضعيفة", unlocked: true },
    { icon: "🪨", nameAr: "الصخرة", descAr: "لعب متحفّظ وثابت", unlocked: false },
    { icon: "🎲", nameAr: "المقامر", descAr: "رهانات جريئة", unlocked: false },
    { icon: "🦊", nameAr: "الثعلب", descAr: "ذكاء في القراءة", unlocked: false },
  ],
};

export default function StatsPreview() {
  return <StatsView vm={vm} />;
}
