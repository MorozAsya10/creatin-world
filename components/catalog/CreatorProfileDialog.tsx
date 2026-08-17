"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import { useEffect } from "react";
import { formatFileSize } from "@/lib/presentation";
import { Avatar } from "@/components/ui/Avatar";
import type { CreatorProfile } from "@/lib/types";

type Props = {
  creator: CreatorProfile | null;
  canSeeContacts?: boolean;
  onClose: () => void;
};

// Модалка с полным профилем креатора — переиспользуется из каталога
// (CreatorCatalog), из отклика/приглашения в кабинете заказчика и т.д.
// canSeeContacts прокидывается от вызывающей стороны (см. её же комментарий
// в CreatorCatalog.tsx про пересечение прав) — сам диалог не решает,
// показывать ли контакт.
export function CreatorProfileDialog({ creator, canSeeContacts = false, onClose }: Props) {
  useEffect(() => {
    if (!creator) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [creator, onClose]);

  if (!creator) return null;

  const contact =
    creator.telegramContact ||
    (creator.user?.telegramUsername ? `@${creator.user.telegramUsername}` : null);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-dialog-head">
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Avatar name={`${creator.firstName} ${creator.lastName}`} photoUrl={creator.photoUrl} className="avatar-lg" />
            <div>
              <div className="meta">{creator.category} · {creator.city || "Город не указан"}</div>
              <h2 id="creator-profile-title">{creator.firstName} {creator.lastName}</h2>
              <p>{creator.primaryRole} · {creator.level}</p>
            </div>
          </div>
          <button className="btn ghost icon" type="button" onClick={onClose} aria-label="Закрыть профиль">
            <X size={18} />
          </button>
        </div>

        <div className="profile-dialog-body">
          <div className="profile-facts">
            <div><span>Опыт</span><b>{creator.experienceYears} лет</b></div>
            <div><span>Формат</span><b>{creator.workFormat}</b></div>
            <div><span>Минимальный чек</span><b>от {creator.minBudget.toLocaleString("ru-RU")} ₽</b></div>
            <div><span>Доступность</span><b>{creator.availability === "available" ? "Свободен сейчас" : "Свободен скоро"}</b></div>
          </div>

          <div className="profile-dialog-section">
            <h3>О креаторе</h3>
            <p>{creator.bio}</p>
            <div>
              {creator.expertise.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>

          {creator.cases ? (
            <div className="profile-dialog-section">
              <h3>Кейсы</h3>
              <p className="preline">{creator.cases}</p>
            </div>
          ) : null}

          <div className="profile-dialog-section">
            <h3>Портфолио</h3>
            <div className="file-list">
              {creator.portfolioUrl ? (
                <a className="file-row" href={creator.portfolioUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  <span>Внешнее портфолио</span>
                </a>
              ) : null}
              {creator.files?.map((file) => (
                <a className="file-row" href={file.url} target="_blank" rel="noreferrer" key={file.id}>
                  <FileText size={16} />
                  <span>{file.fileName}</span>
                  <small>{formatFileSize(file.size)}</small>
                </a>
              ))}
              {!creator.portfolioUrl && !creator.files?.length ? (
                <div className="notice">Файлы портфолио пока не добавлены.</div>
              ) : null}
            </div>
          </div>

          <div className="profile-dialog-section">
            <h3>Контакт</h3>
            {canSeeContacts && contact ? (
              <div className="contact-open">{contact}</div>
            ) : (
              <div className="contact-mask">Контакт доступен авторизованному заказчику по условиям текущего режима.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
