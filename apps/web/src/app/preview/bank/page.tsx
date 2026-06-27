import { BankView } from "@/components/games/bank-view";

/** PREVIEW ONLY — no auth/DB; mock data to judge the bank redesign. */
export const dynamic = "force-static";

export default function BankPreview() {
  return (
    <BankView
      balance="12,450"
      amount="6,000"
      claimedToday={false}
      resetText="00:00"
      history={[
        { when: "اليوم", amount: "500", balanceAfter: "12,450", level: 6 },
        { when: "اليوم", amount: "1,200", balanceAfter: "11,950", level: 6 },
        { when: "أمس", amount: "5,000", balanceAfter: "10,750", level: 5 },
      ]}
    />
  );
}
