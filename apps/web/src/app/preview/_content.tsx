"use client";

/**
 * DB-FREE theme review surfaces. Renders the REAL platform/game components in fixed mock
 * states so both themes can be eyeballed locally without a database, game-servers, or a
 * session. Rendered by /preview/ui/[theme]/[view], which wraps each in <div data-theme>.
 * Temporary review harness (remove at sign-off). No product logic depends on it.
 */

import type { ReactNode } from "react";
import type { TtCardView, TtSeatView, TtStandingRow, TtStateView } from "@fb/shared";

import { GAMES } from "@/lib/games";
import { PlatformHub } from "@/components/games/platform-hub";
import { LinkUpHome } from "@/components/games/link-up-home";
import { BankView } from "@/components/games/bank-view";
import { ProfileScreen } from "@/components/games/profile-screen";
import { RankView, type RankedPlayer } from "@/components/games/rank-view";
import { FriendsScreen } from "@/components/games/friends-screen";
import { StatsView, type StatsVM } from "@/components/games/stats-view";
import { LoginForm } from "@/components/login-form";
import { LevelUpModal } from "@/components/level-up-modal";
import { RoomClosedNotice } from "@/components/room-closed-notice";
import { TenHome } from "@/components/top-10/TenHome";
import { TenTable } from "@/components/top-10/table/TenTable";
import { TenWinner } from "@/components/top-10/TopTenClient";

/** A labelled frame. `transform` establishes a containing block so a component's own
 *  `position:fixed` (overlays, bottom tab bars) is contained to the frame, not the page. */
function Frame({ label, h = 780, children }: { label: string; h?: number; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ font: "700 13px system-ui", color: "#8a8a8a", margin: "0 0 6px 4px" }}>{label}</h3>
      <div
        style={{
          position: "relative",
          transform: "translateZ(0)",
          width: "100%",
          maxWidth: 460,
          height: h,
          margin: "0 auto",
          overflow: "auto",
          borderRadius: 14,
          outline: "1px solid rgba(128,128,128,0.28)",
          background: "var(--fb-bg)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ── shared game mocks ────────────────────────────────────────────────────────
const NAMES = [
  ["L. Messi", "ليونيل ميسي"], ["K. Benzema", "كريم بنزيما"], ["L. Suárez", "لويس سواريز"],
  ["A. Griezmann", "أنطوان غريزمان"], ["Iago Aspas", "ياغو أسباس"], ["G. Moreno", "جيرارد مورينو"],
  ["C. Stuani", "كريستيان ستواني"], ["Y. En-Nesyri", "يوسف النصيري"], ["R. de Tomás", "دي توماس"],
  ["Á. Morata", "ألفارو موراتا"],
] as const;
const VALUES = [24, 22, 19, 18, 16, 14, 13, 11, 10, 8];

function seatMock(i: number, name: string, id: string, total: number, round: number, extra: Partial<TtSeatView> = {}): TtSeatView {
  return {
    seat: i, userId: id, username: name, playerNumber: 9000 + i, isBot: false, connected: true,
    totalPoints: total, roundPoints: round, status: "ACTIVE", wrongAttempts: 0, locked: false, away: false, ...extra,
  };
}
const SEATS: TtSeatView[] = [
  seatMock(0, "فهد العتيبي", "me", 31, 12),
  seatMock(1, "خالد", "u1", 27, 9),
  seatMock(2, "نوّاف", "u2", 22, 5),
  seatMock(3, "بوت", "u3", 18, 7, { isBot: true }),
];
function cardsMock(revealed: number): TtCardView[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const rank = idx + 1;
    const on = idx < revealed;
    return {
      rank,
      revealed: on,
      player: on ? { id: `p${rank}`, name: NAMES[idx]![0], nameAr: NAMES[idx]![1], value: VALUES[idx]!, photoUrl: null } : null,
      bySeat: on ? idx % 4 : null,
    };
  });
}
const BASE_STATE: TtStateView = {
  matchId: "preview", kind: "QUICK_PLAY", inviteCode: null, roomName: null, maxPlayers: 4,
  status: "IN_PROGRESS", difficulty: "MEDIUM", createdByUserId: "me", roundTimerSec: 600,
  roundNo: 2, roundsTotal: 3, mode: "NORMAL",
  question: { type: "GOAL_SCORERS", titleAr: "أكثر اللاعبين تسجيلاً — الدوري الإسباني من 2019/20 إلى 2020/21", competitionAr: "الدوري الإسباني", season: 2020 },
  cards: cardsMock(4), seats: SEATS, turnSeat: 0, deadlineTs: Date.now() + 22_000,
  hint: null, endRoundRequest: null, newRoundRequest: null,
};

// ── 1) game table ────────────────────────────────────────────────────────────
export function TablePreview() {
  return (
    <div style={{ position: "relative", height: 820, maxWidth: 460, margin: "0 auto", transform: "translateZ(0)", overflow: "hidden", borderRadius: 14, outline: "1px solid rgba(128,128,128,0.28)" }}>
      <TenTable state={BASE_STATE} meId="me" nickname="فهد العتيبي" reveal={null} onPick={() => {}} onLeave={() => {}} />
    </div>
  );
}

// ── 2) winner announcement ───────────────────────────────────────────────────
export function WinnerPreview() {
  const standings: TtStandingRow[] = [
    { userId: "me", username: "فهد العتيبي", seat: 0, points: 31, place: 1, tiedWithPrev: false },
    { userId: "u1", username: "خالد", seat: 1, points: 27, place: 2, tiedWithPrev: false },
    { userId: "u2", username: "نوّاف", seat: 2, points: 22, place: 3, tiedWithPrev: false },
    { userId: "u3", username: "بوت", seat: 3, points: 18, place: 4, tiedWithPrev: false },
  ];
  const endState: TtStateView = {
    ...BASE_STATE, status: "ENDED", cards: cardsMock(10),
    newRoundRequest: { readySeats: [3], needed: 3, deadlineTs: Date.now() + 15_000 },
  };
  const result = { round: 1, standings, seats: SEATS, cards: cardsMock(10) };
  return (
    <div style={{ position: "relative", height: 900, maxWidth: 460, margin: "0 auto", transform: "translateZ(0)", overflow: "auto", borderRadius: 14, outline: "1px solid rgba(128,128,128,0.28)", background: "var(--fb-bg)" }}>
      <TenWinner state={endState} meId="me" result={result} abandoned={false} onNewRound={() => {}} onClose={() => {}} onExit={() => {}} />
    </div>
  );
}

// ── 3) whole platform (everything except the table) ──────────────────────────
const RANKED = (n: number, name: string, seed: string, lvl: number, xp: number, you = false): RankedPlayer => ({
  id: seed, name, playerNumber: 9000 + n, level: lvl, xp, avatarSrc: null, seed, rank: n, you,
});
const STATS_VM: StatsVM = {
  displayName: "فهد العتيبي", playerNumber: 9012, avatarSrc: null, hue: 40, level: 7, xp: 1200,
  progress: 0.62, xpToNext: 800,
  core: [
    { icon: "🏆", label: "انتصارات", value: "34", tone: "gold" },
    { icon: "🎯", label: "مباريات", value: "58", tone: "cream" },
    { icon: "💔", label: "خسارات", value: "24", tone: "lose" },
  ],
  analysis: {
    bars: [
      { label: "الدقة", r: 0.72, display: "72%", tone: "gold" },
      { label: "السرعة", r: 0.55, display: "55%", tone: "ember" },
    ],
    luck: 62, biggestPot: "3,200", longestWinStreak: "5",
  },
  badges: [
    { icon: "🥇", nameAr: "البطل", descAr: "فُز بأول مباراة", unlocked: true },
    { icon: "🔥", nameAr: "متوهّج", descAr: "٥ انتصارات متتالية", unlocked: true },
    { icon: "💎", nameAr: "أسطورة", descAr: "١٠٠ انتصار", unlocked: false },
  ],
};

export function PlatformGallery() {
  return (
    <div style={{ padding: 16 }}>
      <Frame label="المنصة — الصفحة الرئيسية (Hub)" h={820}>
        <PlatformHub displayName="فهد العتيبي" avatarUrl={null} hue={40} initial="ف" games={GAMES} logoutAction={() => {}} />
      </Frame>
      <Frame label="لينك اب — الرئيسية" h={820}>
        <LinkUpHome rank="#12" totalPlayers="1,240" />
      </Frame>
      <Frame label="توب 10 — الرئيسية" h={820}>
        <TenHome rank="#7" hubUrl="/" />
      </Frame>
      <Frame label="تسجيل الدخول" h={640}>
        <LoginForm notice="مرحبًا بعودتك" />
      </Frame>
      <Frame label="البنك (المكافأة اليومية)" h={760}>
        <BankView balance="1,000" amount="1000" claimedToday={false} resetText="خلال ٥ ساعات" history={[
          { when: "اليوم", amount: "+1000", balanceAfter: "1,000", level: null },
          { when: "أمس", amount: "+50", balanceAfter: "0", level: 6 },
        ]} />
      </Frame>
      <Frame label="الملف الشخصي" h={760}>
        <ProfileScreen displayName="فهد العتيبي" subtitle="عضو منذ 2026" avatarUrl={null} avatarSeed="فهد" level={7} likes={128}
          rows={[["الانتصارات", "34"], ["المباريات", "58"], ["الأصدقاء", "12"]]} currentNickname="فهد العتيبي" hasAvatar={false} />
      </Frame>
      <Frame label="التصنيف (Rank)" h={820}>
        <RankView
          podium={[
            { p: RANKED(1, "سعود", "سعود", 12, 4800), place: 1 },
            { p: RANKED(2, "فهد العتيبي", "فهد", 7, 1200, true), place: 2 },
            { p: RANKED(3, "خالد", "خالد", 9, 2100), place: 3 },
          ]}
          listed={[RANKED(4, "نوّاف", "نوّاف", 6, 900), RANKED(5, "تركي", "تركي", 5, 700), RANKED(6, "ماجد", "ماجد", 4, 400)]}
          pinnedMe={RANKED(2, "فهد العتيبي", "فهد", 7, 1200, true)} empty={false} />
      </Frame>
      <Frame label="الإحصائيات" h={860}>
        <StatsView vm={STATS_VM} />
      </Frame>
      <Frame label="الأصدقاء" h={640}>
        <FriendsScreen
          requests={[{ id: "r1", name: "خالد", playerNumber: 9101, level: 9, avatarSrc: null, seed: "خالد" }]}
          friends={[{ id: "f1", name: "نوّاف", playerNumber: 9102, level: 6, avatarSrc: null, seed: "نوّاف" }, { id: "f2", name: "تركي", playerNumber: 9103, level: 5, avatarSrc: null, seed: "تركي" }]} />
      </Frame>
      <Frame label="إشعار: ترقية المستوى (Level up)" h={640}>
        <LevelUpModal newLevel={7} dailyBank="1000" />
      </Frame>
      <Frame label="إشعار: إغلاق الطاولة (يظهر ٤ ثوانٍ)" h={420}>
        <RoomClosedNotice />
      </Frame>
      <p style={{ font: "12px system-ui", color: "#8a8a8a", maxWidth: 460, margin: "0 auto" }}>
        ملاحظة: إشعار «التثبيت/المكافأة» (InstallRewardModal) لا يظهر هنا لأنه مربوط بحدث المتصفّح
        beforeinstallprompt ولا يمكن محاكاته في معاينة ثابتة.
      </p>
    </div>
  );
}
