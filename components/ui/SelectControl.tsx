"use client";

import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  containerClassName?: string;
};

export function SelectControl({ children, className = "", containerClassName = "", ...props }: Props) {
  return (
    <span className={`select-control ${containerClassName}`.trim()}>
      <select className={className} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
    </span>
  );
}
