import { VEHICLES, formatEUR } from '@leaddesk/shared';
import { Link, useParams } from 'react-router-dom';
import { VehicleArt } from '../components/VehicleArt';
import { useEnquiry } from '../state';
import { NotFound } from './NotFound';

const FUEL_NOTE: Record<string, string> = {
  Electric: 'Zero tailpipe emissions and quiet, instant torque',
  Hybrid: 'Electric assist for efficient city and motorway driving',
  Petrol: 'Responsive petrol engine with low running costs',
  Diesel: 'Long-range diesel with strong pulling power',
};

export function ModelDetail() {
  const { slug } = useParams();
  const { openSheet } = useEnquiry();
  const v = VEHICLES.find((x) => x.slug === slug);
  if (!v) return <NotFound />;
  const highlights = [
    `${v.body} body style built for everyday use`,
    FUEL_NOTE[v.fuel] ?? `${v.fuel} drivetrain`,
    `Starting at ${formatEUR(v.priceCents)} with finance options available`,
  ];
  return (
    <section className="section detail">
      <Link to="/" className="muted">
        ← All models
      </Link>
      <div className="detail-grid">
        <VehicleArt slug={v.slug} label={v.name} />
        <div>
          <h1>{v.name}</h1>
          <p className="muted">
            {v.body} · {v.fuel}
          </p>
          <p className="price">from {formatEUR(v.priceCents)}</p>
          <ul className="highlights">
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => openSheet(v.slug)}>
            I'm interested
          </button>
        </div>
      </div>
    </section>
  );
}
