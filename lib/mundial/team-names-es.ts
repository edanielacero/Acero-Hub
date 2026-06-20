// Maps English team names (and TLA codes) to Spanish equivalents.
// Used to allow searching in Spanish in the Mundial app.

const NAME_MAP: Record<string, string> = {
  // Europe
  'Germany': 'Alemania',
  'France': 'Francia',
  'Spain': 'España',
  'England': 'Inglaterra',
  'Portugal': 'Portugal',
  'Netherlands': 'Países Bajos',
  'Italy': 'Italia',
  'Belgium': 'Bélgica',
  'Switzerland': 'Suiza',
  'Croatia': 'Croacia',
  'Serbia': 'Serbia',
  'Poland': 'Polonia',
  'Denmark': 'Dinamarca',
  'Sweden': 'Suecia',
  'Norway': 'Noruega',
  'Finland': 'Finlandia',
  'Austria': 'Austria',
  'Hungary': 'Hungría',
  'Czech Republic': 'República Checa',
  'Czechia': 'República Checa',
  'Slovakia': 'Eslovaquia',
  'Slovenia': 'Eslovenia',
  'Romania': 'Rumanía',
  'Greece': 'Grecia',
  'Turkey': 'Turquía',
  'Ukraine': 'Ucrania',
  'Russia': 'Rusia',
  'Scotland': 'Escocia',
  'Wales': 'Gales',
  'Ireland': 'Irlanda',
  'Northern Ireland': 'Irlanda del Norte',
  'Albania': 'Albania',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  'Bulgaria': 'Bulgaria',
  'Georgia': 'Georgia',
  'Iceland': 'Islandia',
  'Kosovo': 'Kosovo',
  'Latvia': 'Letonia',
  'Lithuania': 'Lituania',
  'Luxembourg': 'Luxemburgo',
  'Malta': 'Malta',
  'Moldova': 'Moldavia',
  'Montenegro': 'Montenegro',
  'North Macedonia': 'Macedonia del Norte',
  'Cyprus': 'Chipre',
  'Estonia': 'Estonia',
  'Belarus': 'Bielorrusia',
  'Azerbaijan': 'Azerbaiyán',
  'Armenia': 'Armenia',
  'Kazakhstan': 'Kazajistán',

  // Americas
  'Brazil': 'Brasil',
  'Mexico': 'México',
  'United States': 'Estados Unidos',
  'USA': 'Estados Unidos',
  'Canada': 'Canadá',
  'Uruguay': 'Uruguay',
  'Colombia': 'Colombia',
  'Chile': 'Chile',
  'Peru': 'Perú',
  'Ecuador': 'Ecuador',
  'Bolivia': 'Bolivia',
  'Paraguay': 'Paraguay',
  'Venezuela': 'Venezuela',
  'Argentina': 'Argentina',
  'Costa Rica': 'Costa Rica',
  'Honduras': 'Honduras',
  'Panama': 'Panamá',
  'Jamaica': 'Jamaica',
  'El Salvador': 'El Salvador',
  'Guatemala': 'Guatemala',
  'Trinidad and Tobago': 'Trinidad y Tobago',
  'Haiti': 'Haití',
  'Cuba': 'Cuba',
  'Dominican Republic': 'República Dominicana',

  // Africa
  'Morocco': 'Marruecos',
  'Senegal': 'Senegal',
  'Nigeria': 'Nigeria',
  'Ghana': 'Ghana',
  'Cameroon': 'Camerún',
  'Ivory Coast': "Costa de Marfil",
  "Côte d'Ivoire": "Costa de Marfil",
  'South Africa': 'Sudáfrica',
  'Egypt': 'Egipto',
  'Algeria': 'Argelia',
  'Tunisia': 'Túnez',
  'DR Congo': 'RD Congo',
  'Democratic Republic of Congo': 'Rep. Dem. del Congo',
  'Mali': 'Malí',
  'Kenya': 'Kenia',
  'Ethiopia': 'Etiopía',
  'Tanzania': 'Tanzania',
  'Angola': 'Angola',
  'Zimbabwe': 'Zimbabue',
  'Uganda': 'Uganda',
  'Zambia': 'Zambia',
  'Mozambique': 'Mozambique',
  'Guinea': 'Guinea',
  'Guinea-Bissau': 'Guinea-Bisáu',
  'Gabon': 'Gabón',
  'Benin': 'Benín',
  'Cape Verde': 'Cabo Verde',
  'Rwanda': 'Ruanda',
  'Libya': 'Libia',
  'Sudan': 'Sudán',
  'Namibia': 'Namibia',
  'Niger': 'Níger',
  'Burkina Faso': 'Burkina Faso',
  'Togo': 'Togo',

  // Asia
  'Japan': 'Japón',
  'South Korea': 'Corea del Sur',
  'Korea Republic': 'Corea del Sur',
  'North Korea': 'Corea del Norte',
  'China': 'China',
  'Australia': 'Australia',
  'Saudi Arabia': 'Arabia Saudita',
  'Iran': 'Irán',
  'Iraq': 'Irak',
  'Jordan': 'Jordania',
  'Qatar': 'Catar',
  'UAE': 'Emiratos Árabes Unidos',
  'United Arab Emirates': 'Emiratos Árabes Unidos',
  'Kuwait': 'Kuwait',
  'Bahrain': 'Baréin',
  'Oman': 'Omán',
  'Syria': 'Siria',
  'Lebanon': 'Líbano',
  'Palestine': 'Palestina',
  'Uzbekistan': 'Uzbekistán',
  'India': 'India',
  'Indonesia': 'Indonesia',
  'Thailand': 'Tailandia',
  'Vietnam': 'Vietnam',
  'Philippines': 'Filipinas',
  'Malaysia': 'Malasia',
  'Singapore': 'Singapur',
  'Myanmar': 'Birmania',
  'Afghanistan': 'Afganistán',
  'Pakistan': 'Pakistán',
  'Bangladesh': 'Bangladés',
  'Nepal': 'Nepal',
  'Kyrgyzstan': 'Kirguistán',
  'Tajikistan': 'Tayikistán',
  'Turkmenistan': 'Turkmenistán',

  // Oceania
  'New Zealand': 'Nueva Zelanda',
  'Fiji': 'Fiyi',
  'Papua New Guinea': 'Papúa Nueva Guinea',
  'Solomon Islands': 'Islas Salomón',
}

const TLA_MAP: Record<string, string> = {
  'ENG': 'ING', // Inglaterra
  'GER': 'ALE', // Alemania
  'NED': 'HOL', // Holanda
  'USA': 'EUA', // Estados Unidos
  'JPN': 'JAP', // Japón
  'KOR': 'COR', // Corea del Sur
  'IRN': 'IRA', // Irán
  'KSA': 'ARS', // Arabia Saudita
  'SCO': 'ESC', // Escocia
  'SWE': 'SUE', // Suecia
  'CIV': 'CDM', // Costa de Marfil
}

// Also index by reversed (Spanish → English) for partial matching
const ES_NAMES = Object.values(NAME_MAP)

/**
 * Returns the Spanish name for a given English team name, or the original if not found.
 */
export function teamNameEs(englishName: string): string {
  return NAME_MAP[englishName] ?? englishName
}

export function tlaEs(tla: string): string {
  return TLA_MAP[tla] ?? tla
}

/**
 * Returns all searchable tokens for a team in both English and Spanish.
 * Used to allow searching in either language.
 */
export function teamSearchTokens(name: string, tla: string): string {
  const es = NAME_MAP[name]
  const tlaSpanish = TLA_MAP[tla]
  const parts = [name.toLowerCase(), tla.toLowerCase()]
  if (es) parts.push(es.toLowerCase())
  if (tlaSpanish) parts.push(tlaSpanish.toLowerCase())
  return parts.join(' ')
}
