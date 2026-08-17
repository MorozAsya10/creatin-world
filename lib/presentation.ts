// Человекочитаемые подписи для enum-статусов из schema.prisma (Order,
// CreatorProfile, ClientProfile, Application, Payment и т.д. используют
// разные enum'ы, но многие значения текстуально совпадают, поэтому таблица
// общая). Если в schema.prisma добавляется новый статус — не забыть
// добавить сюда подпись, иначе в UI покажется сырое значение enum'а.
const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  PAYMENT_PENDING: "Ожидает оплаты",
  MODERATION: "На модерации",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  PUBLISHED: "Опубликовано",
  COMPLETED: "Завершено",
  ARCHIVED: "В архиве",
  SENT: "Отправлено",
  VIEWED: "Просмотрено",
  SHORTLISTED: "В шорт-листе",
  CHAT_OPEN: "Чат открыт",
  ACCEPTED: "Принято",
  DECLINED: "Отклонено",
  CREATED: "Создан",
  SUCCEEDED: "Успешно",
  FAILED: "Ошибка",
  REFUNDED: "Возврат"
};

export function statusLabel(status?: string | null) {
  if (!status) return "Не указан";
  return statusLabels[status] || status;
}

export function orderInitiatorLabel(initiator?: string | null) {
  return initiator === "CREATOR" ? "Заказ от креатора" : "Заказ от заказчика";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
