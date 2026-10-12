"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  hint,
  action,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-[#425466]">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[12px] text-[#697386]">{hint}</p>}
    </div>
  );
}

/** Small section heading used between groups of fields. */
export function GroupHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#0a2540]">
        {title}
      </h3>
      {description && (
        <p className="mt-0.5 text-[12.5px] text-[#697386]">{description}</p>
      )}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
        selected
          ? "border-[#c9c5ff] bg-[#f0efff] font-medium text-[#635bff]"
          : "border-[#e6ebf1] bg-white text-[#425466] hover:border-[#c9c5ff] hover:text-[#0a2540]"
      )}
    >
      {children}
    </button>
  );
}

/** Segmented control for short option lists. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-[#e6ebf1] bg-[#f6f9fc] p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-[13px] transition-[background-color,color,box-shadow] duration-150",
              selected
                ? "bg-white font-medium text-[#0a2540] shadow-[0_1px_3px_rgba(10,37,64,0.12)]"
                : "text-[#697386] hover:text-[#0a2540]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left",
        disabled && "cursor-not-allowed"
      )}
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[13.5px] font-medium",
            disabled ? "text-[#a3acb9]" : "text-[#0a2540]"
          )}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12px] text-[#697386]">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200",
          checked ? "bg-[#635bff]" : "bg-[#e6ebf1]"
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}

export function EnhanceButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#635bff] transition-colors hover:bg-[#f0efff] disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      Enhance
    </button>
  );
}

/** Animates open/closed with a grid-rows transition (no height measuring). */
export function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
