"use client";

export function BarChart({
  data,
  valueKey,
  labelKey = "date",
  color = "#635bff",
  height = 120,
}: {
  data: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey?: string;
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] || 0)));
  return (
    <div className="flex h-full items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey] || 0);
        const h = Math.max(2, Math.round((v / max) * (height - 18)));
        return (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full max-w-[18px] rounded-t-sm"
              style={{ height: h, background: color }}
              title={`${d[labelKey]}: ${v}`}
            />
            <span className="truncate text-[9px] text-[#a3acb9]">
              {String(d[labelKey]).slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StackedSentiment({
  sentiment,
}: {
  sentiment: Record<string, number>;
}) {
  const order = [
    ["delighted", "#0e6245", "Delighted"],
    ["happy", "#3ddc84", "Happy"],
    ["neutral", "#a3acb9", "Neutral"],
    ["frustrated", "#f5a623", "Frustrated"],
    ["churning", "#df1b41", "Churning"],
  ] as const;
  const total = Math.max(
    1,
    order.reduce((s, [k]) => s + (sentiment[k] ?? 0), 0)
  );

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#f0f3f7]">
        {order.map(([key, color]) => {
          const n = sentiment[key] ?? 0;
          if (!n) return null;
          return (
            <div
              key={key}
              style={{ width: `${(100 * n) / total}%`, background: color }}
              title={`${key}: ${n}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {order.map(([key, color, label]) => (
          <div key={key} className="rounded-lg border border-[#e6ebf1] px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-[11px] text-[#697386]">{label}</span>
            </div>
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#0a2540]">
              {sentiment[key] ?? 0}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e6ebf1] bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
        {label}
      </p>
      <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#0a2540]">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-[#697386]">{hint}</p> : null}
    </div>
  );
}
