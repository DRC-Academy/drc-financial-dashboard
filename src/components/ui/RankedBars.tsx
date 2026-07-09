import { EmptyState } from "./EmptyState";

export function RankedBars({
  items,
  color = "var(--drc-green)",
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  if (items.length === 0) return <EmptyState />;

  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, 8);
  const max = Math.max(...sorted.map((i) => i.value), 1);

  return (
    <div className="space-y-2.5">
      {sorted.map((item) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-drc-ink truncate pr-2">{item.label}</span>
            <span className="tabular text-drc-ink-soft shrink-0">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-drc-bg overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
