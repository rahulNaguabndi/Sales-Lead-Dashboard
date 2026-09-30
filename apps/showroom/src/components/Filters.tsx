export interface FilterState {
  body: string;
  fuel: string;
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="chips">
      {['All', ...options].map((o) => {
        const v = o === 'All' ? '' : o;
        return (
          <button
            key={o}
            type="button"
            className={`chip${value === v ? ' chip-on' : ''}`}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Filters({
  bodies,
  fuels,
  value,
  onChange,
}: {
  bodies: readonly string[];
  fuels: readonly string[];
  value: FilterState;
  onChange: (v: FilterState) => void;
}) {
  return (
    <div className="filters">
      <Chips
        label="Body type"
        options={bodies}
        value={value.body}
        onChange={(body) => onChange({ ...value, body })}
      />
      <Chips
        label="Fuel"
        options={fuels}
        value={value.fuel}
        onChange={(fuel) => onChange({ ...value, fuel })}
      />
    </div>
  );
}
