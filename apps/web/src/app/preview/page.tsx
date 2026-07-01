import Link from "next/link";
import { notFound } from "next/navigation";
import { THEMES } from "@fb/theme/themes";

/** Index of the DB-free theme review previews. Dev-only. */
export const dynamic = "force-static";

const VIEWS: { key: string; label: string }[] = [
  { key: "platform", label: "المنصة كاملة (كل شيء ما عدا الطاولة)" },
  { key: "table", label: "طاولة اللعب" },
  { key: "winner", label: "شاشة إعلان الفائز" },
];

export default function PreviewIndex() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ font: "14px system-ui", padding: 24, maxWidth: 640, margin: "0 auto", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>معاينات السمات (بدون قاعدة بيانات)</h1>
      <p style={{ color: "#666" }}>
        كل معاينة تعرض المكوّنات الحقيقية بحالة ثابتة وهمية، بالسمة المحدّدة. افتح كل رابط لمراجعة السمة.
      </p>
      <p style={{ color: "#666" }}>
        لوحة الرموز (tokens + utilities): <Link href="/preview/theme">/preview/theme</Link>
      </p>
      {THEMES.map((t) => (
        <section key={t.id} style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Theme {t.id} — {t.name}</h2>
          <ul>
            {VIEWS.map((v) => (
              <li key={v.key}>
                <Link href={`/preview/ui/${t.id}/${v.key}`}>/preview/ui/{t.id}/{v.key}</Link> — {v.label}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
