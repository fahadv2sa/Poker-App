export default function HomePage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Football Poker</h1>
      <p style={{ opacity: 0.8, marginBottom: "2rem" }}>
        لعبة ورق كرة قدم بأسلوب بوكر — أونلاين. هذه نواة المشروع (Phase 1: الأساس).
      </p>

      <section
        style={{
          background: "#121826",
          border: "1px solid #243049",
          borderRadius: 12,
          padding: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>واجهات Phase 1 المتاحة</h2>
        <ul style={{ lineHeight: 2, margin: 0, paddingInlineStart: "1.25rem" }}>
          <li>
            <code>POST /api/auth/register</code> — إنشاء حساب + منحة 1000 + تهيئة المحفظة
          </li>
          <li>
            <code>POST /api/auth/callback/credentials</code> — تسجيل الدخول (Auth.js)
          </li>
          <li>
            <code>POST /api/auth/logout</code> — تسجيل الخروج
          </li>
          <li>
            <code>GET /api/profile/me</code> — الملف الشخصي (محمي بجلسة)
          </li>
        </ul>
      </section>

      <p style={{ opacity: 0.55, marginTop: "2rem", fontSize: "0.9rem" }}>
        الواجهة الكاملة (RTL Premium، شاشة الطاولة) تُبنى في Phase 4.
      </p>
    </main>
  );
}
