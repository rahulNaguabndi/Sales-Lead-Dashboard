import { formatEUR, type VEHICLES } from '@leaddesk/shared';
import { Link } from 'react-router-dom';
import { useEnquiry } from '../state';
import { VehicleArt } from './VehicleArt';

type Vehicle = (typeof VEHICLES)[number];

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { openSheet } = useEnquiry();
  return (
    <article className="card" data-testid="vehicle-card">
      <Link to={`/models/${vehicle.slug}`} aria-label={`${vehicle.name} details`}>
        <VehicleArt slug={vehicle.slug} label={vehicle.name} />
      </Link>
      <div className="card-body">
        <h3>
          <Link to={`/models/${vehicle.slug}`}>{vehicle.name}</Link>
        </h3>
        <p className="muted">
          {vehicle.body} · {vehicle.fuel}
        </p>
        <p className="price">from {formatEUR(vehicle.priceCents)}</p>
        <button
          type="button"
          className="btn btn-primary"
          aria-label={`I'm interested in the ${vehicle.name}`}
          onClick={() => openSheet(vehicle.slug)}
        >
          I'm interested
        </button>
      </div>
    </article>
  );
}
