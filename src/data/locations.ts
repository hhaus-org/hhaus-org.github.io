export interface Location {
  readonly slug: string;
  readonly city: string;
  readonly country: string;
  readonly code: string;
  readonly status: 'chapter' | 'forming';
  readonly theme: string;
  readonly domain: string;
  readonly description: string;
}

export const locations = [
  { slug: 'berlin', city: 'Berlin', country: 'Germany', code: 'BER', status: 'forming', theme: 'electric', domain: 'berlin.hhaus.org', description: 'A focused home base for builders drawn to Berlin’s independent, international creative scene.' },
  { slug: 'medellin', city: 'Medellín', country: 'Colombia', code: 'MDE', status: 'chapter', theme: 'mango', domain: 'medellin.hhaus.org', description: 'The founding H/HAUS chapter: a meeting point for builders living and working in Medellín.' },
  { slug: 'tokyo', city: 'Tokyo', country: 'Japan', code: 'TYO', status: 'forming', theme: 'pink', domain: 'tokyo.hhaus.org', description: 'A future chapter for patient craft, ambitious systems, and the people building them in Tokyo.' },
  { slug: 'london', city: 'London', country: 'United Kingdom', code: 'LON', status: 'forming', theme: 'blue', domain: 'london.hhaus.org', description: 'A future cross-disciplinary house for people making new things in one of the world’s most connected cities.' },
  { slug: 'sao-paulo', city: 'São Paulo', country: 'Brazil', code: 'SAO', status: 'forming', theme: 'green', domain: 'sao-paulo.hhaus.org', description: 'A future chapter shaped by São Paulo’s scale, energy, and deeply networked creative communities.' },
  { slug: 'cdmx', city: 'CDMX', country: 'Mexico', code: 'MEX', status: 'forming', theme: 'red', domain: 'cdmx.hhaus.org', description: 'A future base for builders moving between technology, art, design, and culture in Mexico City.' },
  { slug: 'montreal', city: 'Montréal', country: 'Canada', code: 'YUL', status: 'forming', theme: 'lavender', domain: 'montreal.hhaus.org', description: 'A future chapter for curious, independent people building at the meeting point of research and culture.' },
] as const satisfies readonly Location[];

export const locationStatusLabel = (status: Location['status']): string =>
  status === 'chapter' ? 'Founding chapter' : 'Chapter forming';
