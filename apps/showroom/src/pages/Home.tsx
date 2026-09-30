import { VEHICLES } from '@leaddesk/shared';
import { useState } from 'react';
import { Filters, type FilterState } from '../components/Filters';
import { VehicleCard } from '../components/VehicleCard';

const BODIES = [...new Set(VEHICLES.map((v) => v.body))];
const FUELS = [...new Set(VEHICLES.map((v) => v.fuel))];

export function Home() {
  const [filter, setFilter] = useState<FilterState>({ body: '', fuel: '' });
  const shown = VEHICLES.filter(
    (v) => (!filter.body || v.body === filter.body) && (!filter.fuel || v.fuel === filter.fuel),
  );
  return (
    <>
      <section className="hero">
        <h1>Find your next drive</h1>
        <p>Six models, one friendly conversation. Tell us what you like and we will reach out your way.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => document.getElementById('models')?.scrollIntoView({ behavior: 'smooth' })}
        >
          Browse models
        </button>
      </section>
      <section id="models" className="section" aria-labelledby="models-h">
        <h2 id="models-h">Our models</h2>
        <Filters bodies={BODIES} fuels={FUELS} value={filter} onChange={setFilter} />
        {shown.length === 0 ? (
          <p className="muted">No models match these filters.</p>
        ) : (
          <div className="grid">
            {shown.map((v) => (
              <VehicleCard key={v.slug} vehicle={v} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
