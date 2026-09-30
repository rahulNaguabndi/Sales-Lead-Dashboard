export const VEHICLES = [
  { slug: 'aurora-suv', name: 'Aurora SUV', body: 'SUV', fuel: 'Hybrid', priceCents: 3_890_000 },
  { slug: 'metro-hatch', name: 'Metro Hatch', body: 'Hatch', fuel: 'Petrol', priceCents: 2_150_000 },
  { slug: 'vento-sedan', name: 'Vento Sedan', body: 'Sedan', fuel: 'Diesel', priceCents: 3_240_000 },
  { slug: 'terra-4x4', name: 'Terra 4x4', body: '4x4', fuel: 'Diesel', priceCents: 5_490_000 },
  { slug: 'luma-ev', name: 'Luma EV', body: 'Hatch', fuel: 'Electric', priceCents: 4_270_000 },
  { slug: 'nova-van', name: 'Nova Van', body: 'Van', fuel: 'Diesel', priceCents: 3_620_000 },
] as const;

export type VehicleSlug = (typeof VEHICLES)[number]['slug'];

export const VEHICLE_SLUGS = VEHICLES.map((v) => v.slug) as unknown as [
  VehicleSlug,
  ...VehicleSlug[],
];

export function vehiclePrice(slug: string): number | undefined {
  return VEHICLES.find((v) => v.slug === slug)?.priceCents;
}
