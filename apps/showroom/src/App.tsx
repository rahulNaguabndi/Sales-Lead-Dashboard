import { VEHICLE_SLUGS } from '@leaddesk/shared';

// Placeholder: F13 owns src/** after this scaffold.
export function App() {
  return (
    <div
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui' }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1>EuroDrive Showroom</h1>
        <p>Lead submission form coming soon (F13).</p>
        <p>{VEHICLE_SLUGS.length} models available.</p>
      </div>
    </div>
  );
}
