import Link from "next/link";

// Минимальный подвал сайта — единственная его сегодняшняя задача: дать
// ссылку на политику обработки персональных данных (см. пункт 152-ФЗ в
// creatin_world_audit_1.md), которую иначе неоткуда открыть на сайте.
// Инлайновые стили вместо нового класса в globals.css — сознательно не
// трогаем визуальный стиль остального сайта, это чисто функциональная
// строка, а не редизайн.
export function Footer() {
  return (
    <footer
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "space-between",
        alignItems: "center",
        padding: "18px 30px",
        borderTop: "1px solid var(--line)",
        color: "var(--muted)",
        fontSize: 13
      }}
    >
      <span>© {new Date().getFullYear()} CREATIN.WORLD</span>
      <Link href="/privacy" style={{ color: "var(--muted)" }}>
        Политика конфиденциальности
      </Link>
    </footer>
  );
}
