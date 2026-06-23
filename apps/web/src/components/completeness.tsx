interface Reports {
  cashup: boolean;
  grossProfit: boolean;
  royalty: boolean;
  stockVariance: boolean;
  stockWastage: boolean;
}

const REPORTS: { key: keyof Reports; label: string }[] = [
  { key: "cashup", label: "Cashup" },
  { key: "royalty", label: "Royalty" },
  { key: "grossProfit", label: "GP" },
  { key: "stockVariance", label: "Stock Var" },
  { key: "stockWastage", label: "Wastage" },
];

// The Store Day's completeness: which of the five report-types have landed.
// A received report-type is solid; a missing one is muted and dashed.
export function Completeness({ reports }: { reports: Reports }) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid="completeness">
      {REPORTS.map(({ key, label }) => {
        const received = reports[key];
        return (
          <li
            className={`rounded border px-2 py-0.5 text-xs ${
              received
                ? "border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "border-dashed text-muted-foreground"
            }`}
            data-present={received}
            data-testid={`report-${key}`}
            key={key}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}
