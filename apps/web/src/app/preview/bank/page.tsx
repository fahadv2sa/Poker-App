import { BankView } from "@/components/games/bank-view";

/** PREVIEW ONLY — no auth/DB; mock data to judge the bank redesign. */
export const dynamic = "force-static";

export default function BankPreview() {
  return (
    <BankView
      balance="48,250"
      amount="6,000"
      level={6}
      claimedToday={false}
      resetText="00:00"
      history={[
        { when: "٢٦ يونيو ٢٠٢٦، ١:١٢ م", amount: "6,000", balanceAfter: "48,250", level: 6 },
        { when: "٢٥ يونيو ٢٠٢٦، ٩:٤٠ ص", amount: "5,000", balanceAfter: "42,100", level: 5 },
        { when: "٢٤ يونيو ٢٠٢٦، ١١:٠٥ م", amount: "5,000", balanceAfter: "37,300", level: 5 },
      ]}
    />
  );
}
