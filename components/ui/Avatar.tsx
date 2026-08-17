// Общий аватар для всей платформы: фото, если оно есть (у демо-креаторов —
// сгенерированная иллюстрация из DiceBear, см. prisma/creator-fixtures.ts),
// иначе — кружок с инициалами. Используется и для креаторов, и для
// заказчиков/админов (у которых photoUrl всегда null, то есть только инициалы).
type Props = {
  name: string;
  photoUrl?: string | null;
  className?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ name, photoUrl, className }: Props) {
  const classes = ["avatar", className].filter(Boolean).join(" ");

  if (photoUrl) {
    return <img className={classes} src={photoUrl} alt={name} loading="lazy" />;
  }

  return (
    <div className={classes} title={name}>
      {initials(name)}
    </div>
  );
}
