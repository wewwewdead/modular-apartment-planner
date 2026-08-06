/**
 * A bundled index of world cities, used to place a site without a network.
 *
 * Two jobs: it backs the search box, and its points are the landmarks drawn on
 * the location map. Settlement follows habitable land closely enough that the
 * scatter reads as continents, which is what lets a coastline-free map still be
 * navigable.
 *
 * Coordinates are approximate city-centre points. That is deliberate and
 * sufficient: one degree of latitude is 111 km and shifts solar altitude by one
 * degree, so a marker that is 5 km off changes a shadow angle by 0.05°. The
 * list is for orientation, not surveying — anyone needing an exact position can
 * type coordinates directly.
 *
 * Philippine cities are covered in more depth than population alone would
 * justify, because that is where this tool is used most.
 */

// [name, country, latitude, longitude] — packed as arrays to keep the module
// small and diff-friendly.
const CITY_DATA = [
  // Philippines
  ['Manila', 'Philippines', 14.6, 120.98],
  ['Quezon City', 'Philippines', 14.68, 121.04],
  ['Caloocan', 'Philippines', 14.65, 120.97],
  ['Makati', 'Philippines', 14.55, 121.02],
  ['Taguig', 'Philippines', 14.52, 121.05],
  ['Pasig', 'Philippines', 14.58, 121.08],
  ['Antipolo', 'Philippines', 14.59, 121.18],
  ['Cebu City', 'Philippines', 10.32, 123.89],
  ['Lapu-Lapu', 'Philippines', 10.31, 123.95],
  ['Mandaue', 'Philippines', 10.33, 123.94],
  ['Davao City', 'Philippines', 7.19, 125.46],
  ['Baguio', 'Philippines', 16.41, 120.6],
  ['Iloilo City', 'Philippines', 10.72, 122.56],
  ['Bacolod', 'Philippines', 10.68, 122.95],
  ['Cagayan de Oro', 'Philippines', 8.48, 124.65],
  ['Zamboanga City', 'Philippines', 6.92, 122.08],
  ['General Santos', 'Philippines', 6.11, 125.17],
  ['Tacloban', 'Philippines', 11.24, 125.0],
  ['Puerto Princesa', 'Philippines', 9.74, 118.74],
  ['Angeles', 'Philippines', 15.15, 120.59],
  ['San Fernando', 'Philippines', 15.03, 120.69],
  ['Olongapo', 'Philippines', 14.83, 120.28],
  ['Naga', 'Philippines', 13.62, 123.18],
  ['Legazpi', 'Philippines', 13.14, 123.74],
  ['Batangas City', 'Philippines', 13.76, 121.06],
  ['Lucena', 'Philippines', 13.93, 121.62],
  ['Butuan', 'Philippines', 8.95, 125.54],
  ['Dumaguete', 'Philippines', 9.31, 123.31],
  ['Tagbilaran', 'Philippines', 9.65, 123.85],
  ['Roxas City', 'Philippines', 11.59, 122.75],
  ['Cotabato City', 'Philippines', 7.22, 124.25],
  ['Ozamiz', 'Philippines', 8.15, 123.84],
  ['Laoag', 'Philippines', 18.2, 120.59],
  ['Vigan', 'Philippines', 17.57, 120.39],
  ['Tuguegarao', 'Philippines', 17.61, 121.73],

  // East and Southeast Asia
  ['Tokyo', 'Japan', 35.68, 139.69],
  ['Osaka', 'Japan', 34.69, 135.5],
  ['Sapporo', 'Japan', 43.06, 141.35],
  ['Fukuoka', 'Japan', 33.59, 130.4],
  ['Seoul', 'South Korea', 37.57, 126.98],
  ['Busan', 'South Korea', 35.18, 129.08],
  ['Beijing', 'China', 39.9, 116.41],
  ['Shanghai', 'China', 31.23, 121.47],
  ['Guangzhou', 'China', 23.13, 113.26],
  ['Shenzhen', 'China', 22.54, 114.06],
  ['Chengdu', 'China', 30.57, 104.07],
  ['Xian', 'China', 34.34, 108.94],
  ['Urumqi', 'China', 43.83, 87.62],
  ['Hong Kong', 'China', 22.32, 114.17],
  ['Taipei', 'Taiwan', 25.03, 121.57],
  ['Ulaanbaatar', 'Mongolia', 47.89, 106.91],
  ['Singapore', 'Singapore', 1.35, 103.82],
  ['Kuala Lumpur', 'Malaysia', 3.14, 101.69],
  ['Kota Kinabalu', 'Malaysia', 5.98, 116.07],
  ['Jakarta', 'Indonesia', -6.21, 106.85],
  ['Surabaya', 'Indonesia', -7.25, 112.75],
  ['Denpasar', 'Indonesia', -8.65, 115.22],
  ['Medan', 'Indonesia', 3.59, 98.67],
  ['Bangkok', 'Thailand', 13.76, 100.5],
  ['Chiang Mai', 'Thailand', 18.79, 98.99],
  ['Hanoi', 'Vietnam', 21.03, 105.85],
  ['Ho Chi Minh City', 'Vietnam', 10.82, 106.63],
  ['Phnom Penh', 'Cambodia', 11.56, 104.92],
  ['Vientiane', 'Laos', 17.97, 102.63],
  ['Yangon', 'Myanmar', 16.87, 96.2],
  ['Bandar Seri Begawan', 'Brunei', 4.9, 114.94],
  ['Dili', 'Timor-Leste', -8.56, 125.56],

  // South and Central Asia
  ['Delhi', 'India', 28.61, 77.21],
  ['Mumbai', 'India', 19.08, 72.88],
  ['Bengaluru', 'India', 12.97, 77.59],
  ['Chennai', 'India', 13.08, 80.27],
  ['Kolkata', 'India', 22.57, 88.36],
  ['Hyderabad', 'India', 17.39, 78.49],
  ['Ahmedabad', 'India', 23.02, 72.57],
  ['Dhaka', 'Bangladesh', 23.81, 90.41],
  ['Kathmandu', 'Nepal', 27.72, 85.32],
  ['Colombo', 'Sri Lanka', 6.93, 79.86],
  ['Karachi', 'Pakistan', 24.86, 67.01],
  ['Lahore', 'Pakistan', 31.55, 74.34],
  ['Islamabad', 'Pakistan', 33.68, 73.05],
  ['Kabul', 'Afghanistan', 34.56, 69.21],
  ['Tashkent', 'Uzbekistan', 41.3, 69.24],
  ['Almaty', 'Kazakhstan', 43.24, 76.89],
  ['Astana', 'Kazakhstan', 51.17, 71.43],

  // Middle East
  ['Tehran', 'Iran', 35.69, 51.39],
  ['Baghdad', 'Iraq', 33.31, 44.36],
  ['Riyadh', 'Saudi Arabia', 24.71, 46.68],
  ['Jeddah', 'Saudi Arabia', 21.49, 39.19],
  ['Dubai', 'UAE', 25.2, 55.27],
  ['Abu Dhabi', 'UAE', 24.45, 54.38],
  ['Doha', 'Qatar', 25.29, 51.53],
  ['Kuwait City', 'Kuwait', 29.38, 47.99],
  ['Muscat', 'Oman', 23.59, 58.41],
  ['Manama', 'Bahrain', 26.23, 50.59],
  ['Tel Aviv', 'Israel', 32.08, 34.78],
  ['Jerusalem', 'Israel', 31.77, 35.21],
  ['Amman', 'Jordan', 31.95, 35.93],
  ['Beirut', 'Lebanon', 33.89, 35.5],
  ['Damascus', 'Syria', 33.51, 36.29],
  ['Sanaa', 'Yemen', 15.37, 44.19],

  // Europe
  ['Istanbul', 'Turkey', 41.01, 28.98],
  ['Ankara', 'Turkey', 39.93, 32.86],
  ['Athens', 'Greece', 37.98, 23.73],
  ['Rome', 'Italy', 41.9, 12.5],
  ['Milan', 'Italy', 45.46, 9.19],
  ['Naples', 'Italy', 40.85, 14.27],
  ['Madrid', 'Spain', 40.42, -3.7],
  ['Barcelona', 'Spain', 41.39, 2.17],
  ['Seville', 'Spain', 37.39, -5.98],
  ['Lisbon', 'Portugal', 38.72, -9.14],
  ['Paris', 'France', 48.86, 2.35],
  ['Lyon', 'France', 45.76, 4.84],
  ['Marseille', 'France', 43.3, 5.37],
  ['London', 'United Kingdom', 51.51, -0.13],
  ['Manchester', 'United Kingdom', 53.48, -2.24],
  ['Edinburgh', 'United Kingdom', 55.95, -3.19],
  ['Dublin', 'Ireland', 53.35, -6.26],
  ['Amsterdam', 'Netherlands', 52.37, 4.9],
  ['Brussels', 'Belgium', 50.85, 4.35],
  ['Berlin', 'Germany', 52.52, 13.4],
  ['Munich', 'Germany', 48.14, 11.58],
  ['Hamburg', 'Germany', 53.55, 9.99],
  ['Frankfurt', 'Germany', 50.11, 8.68],
  ['Vienna', 'Austria', 48.21, 16.37],
  ['Zurich', 'Switzerland', 47.38, 8.54],
  ['Prague', 'Czechia', 50.08, 14.44],
  ['Warsaw', 'Poland', 52.23, 21.01],
  ['Budapest', 'Hungary', 47.5, 19.04],
  ['Bucharest', 'Romania', 44.43, 26.1],
  ['Sofia', 'Bulgaria', 42.7, 23.32],
  ['Belgrade', 'Serbia', 44.79, 20.45],
  ['Zagreb', 'Croatia', 45.81, 15.98],
  ['Kyiv', 'Ukraine', 50.45, 30.52],
  ['Minsk', 'Belarus', 53.9, 27.57],
  ['Moscow', 'Russia', 55.76, 37.62],
  ['Saint Petersburg', 'Russia', 59.93, 30.34],
  ['Novosibirsk', 'Russia', 55.03, 82.92],
  ['Vladivostok', 'Russia', 43.12, 131.89],
  ['Stockholm', 'Sweden', 59.33, 18.07],
  ['Oslo', 'Norway', 59.91, 10.75],
  ['Tromso', 'Norway', 69.65, 18.96],
  ['Copenhagen', 'Denmark', 55.68, 12.57],
  ['Helsinki', 'Finland', 60.17, 24.94],
  ['Reykjavik', 'Iceland', 64.15, -21.94],

  // Africa
  ['Cairo', 'Egypt', 30.04, 31.24],
  ['Alexandria', 'Egypt', 31.2, 29.92],
  ['Casablanca', 'Morocco', 33.57, -7.59],
  ['Marrakesh', 'Morocco', 31.63, -7.99],
  ['Algiers', 'Algeria', 36.75, 3.06],
  ['Tunis', 'Tunisia', 36.81, 10.18],
  ['Tripoli', 'Libya', 32.89, 13.19],
  ['Khartoum', 'Sudan', 15.5, 32.56],
  ['Lagos', 'Nigeria', 6.52, 3.38],
  ['Abuja', 'Nigeria', 9.06, 7.49],
  ['Kano', 'Nigeria', 12.0, 8.52],
  ['Accra', 'Ghana', 5.6, -0.19],
  ['Abidjan', 'Ivory Coast', 5.36, -4.01],
  ['Dakar', 'Senegal', 14.72, -17.47],
  ['Bamako', 'Mali', 12.64, -8.0],
  ['Nairobi', 'Kenya', -1.29, 36.82],
  ['Addis Ababa', 'Ethiopia', 9.03, 38.74],
  ['Kampala', 'Uganda', 0.35, 32.58],
  ['Dar es Salaam', 'Tanzania', -6.79, 39.21],
  ['Kinshasa', 'DR Congo', -4.44, 15.27],
  ['Luanda', 'Angola', -8.84, 13.23],
  ['Harare', 'Zimbabwe', -17.83, 31.05],
  ['Lusaka', 'Zambia', -15.39, 28.32],
  ['Maputo', 'Mozambique', -25.97, 32.57],
  ['Windhoek', 'Namibia', -22.56, 17.08],
  ['Gaborone', 'Botswana', -24.63, 25.92],
  ['Johannesburg', 'South Africa', -26.2, 28.05],
  ['Cape Town', 'South Africa', -33.92, 18.42],
  ['Durban', 'South Africa', -29.86, 31.02],
  ['Antananarivo', 'Madagascar', -18.88, 47.51],

  // North America
  ['New York', 'United States', 40.71, -74.01],
  ['Los Angeles', 'United States', 34.05, -118.24],
  ['Chicago', 'United States', 41.88, -87.63],
  ['Houston', 'United States', 29.76, -95.37],
  ['Phoenix', 'United States', 33.45, -112.07],
  ['Philadelphia', 'United States', 39.95, -75.17],
  ['San Antonio', 'United States', 29.42, -98.49],
  ['San Diego', 'United States', 32.72, -117.16],
  ['Dallas', 'United States', 32.78, -96.8],
  ['San Francisco', 'United States', 37.77, -122.42],
  ['Seattle', 'United States', 47.61, -122.33],
  ['Denver', 'United States', 39.74, -104.99],
  ['Miami', 'United States', 25.76, -80.19],
  ['Boston', 'United States', 42.36, -71.06],
  ['Atlanta', 'United States', 33.75, -84.39],
  ['Minneapolis', 'United States', 44.98, -93.27],
  ['Washington', 'United States', 38.91, -77.04],
  ['Las Vegas', 'United States', 36.17, -115.14],
  ['Honolulu', 'United States', 21.31, -157.86],
  ['Anchorage', 'United States', 61.22, -149.9],
  ['Toronto', 'Canada', 43.65, -79.38],
  ['Montreal', 'Canada', 45.5, -73.57],
  ['Vancouver', 'Canada', 49.28, -123.12],
  ['Calgary', 'Canada', 51.05, -114.07],
  ['Ottawa', 'Canada', 45.42, -75.7],
  ['Winnipeg', 'Canada', 49.9, -97.14],
  ['Mexico City', 'Mexico', 19.43, -99.13],
  ['Guadalajara', 'Mexico', 20.67, -103.35],
  ['Monterrey', 'Mexico', 25.69, -100.32],
  ['Tijuana', 'Mexico', 32.51, -117.04],
  ['Guatemala City', 'Guatemala', 14.63, -90.51],
  ['San Salvador', 'El Salvador', 13.69, -89.22],
  ['Tegucigalpa', 'Honduras', 14.07, -87.19],
  ['Managua', 'Nicaragua', 12.11, -86.24],
  ['San Jose', 'Costa Rica', 9.93, -84.08],
  ['Panama City', 'Panama', 8.98, -79.52],
  ['Havana', 'Cuba', 23.11, -82.37],
  ['Santo Domingo', 'Dominican Republic', 18.49, -69.93],
  ['San Juan', 'Puerto Rico', 18.47, -66.11],
  ['Kingston', 'Jamaica', 17.97, -76.79],

  // South America
  ['Bogota', 'Colombia', 4.71, -74.07],
  ['Medellin', 'Colombia', 6.24, -75.58],
  ['Caracas', 'Venezuela', 10.48, -66.9],
  ['Quito', 'Ecuador', -0.18, -78.47],
  ['Guayaquil', 'Ecuador', -2.17, -79.92],
  ['Lima', 'Peru', -12.05, -77.04],
  ['La Paz', 'Bolivia', -16.5, -68.15],
  ['Santiago', 'Chile', -33.46, -70.65],
  ['Buenos Aires', 'Argentina', -34.6, -58.38],
  ['Cordoba', 'Argentina', -31.42, -64.19],
  ['Montevideo', 'Uruguay', -34.9, -56.16],
  ['Asuncion', 'Paraguay', -25.28, -57.64],
  ['Sao Paulo', 'Brazil', -23.55, -46.63],
  ['Rio de Janeiro', 'Brazil', -22.91, -43.17],
  ['Brasilia', 'Brazil', -15.79, -47.88],
  ['Salvador', 'Brazil', -12.97, -38.5],
  ['Recife', 'Brazil', -8.05, -34.88],
  ['Manaus', 'Brazil', -3.12, -60.02],
  ['Porto Alegre', 'Brazil', -30.03, -51.23],

  // Oceania
  ['Sydney', 'Australia', -33.87, 151.21],
  ['Melbourne', 'Australia', -37.81, 144.96],
  ['Brisbane', 'Australia', -27.47, 153.03],
  ['Perth', 'Australia', -31.95, 115.86],
  ['Adelaide', 'Australia', -34.93, 138.6],
  ['Canberra', 'Australia', -35.28, 149.13],
  ['Darwin', 'Australia', -12.46, 130.84],
  ['Hobart', 'Australia', -42.88, 147.33],
  ['Auckland', 'New Zealand', -36.85, 174.76],
  ['Wellington', 'New Zealand', -41.29, 174.78],
  ['Christchurch', 'New Zealand', -43.53, 172.64],
  ['Port Moresby', 'Papua New Guinea', -9.44, 147.18],
  ['Suva', 'Fiji', -18.14, 178.44],
  ['Honiara', 'Solomon Islands', -9.43, 159.96],
  ['Noumea', 'New Caledonia', -22.28, 166.46],
  ['Papeete', 'French Polynesia', -17.54, -149.57],
];

// Civil zones are attached to the offline city picker so choosing a place also
// chooses the clock its planning documents use. Country defaults cover
// single-zone countries; only genuinely multi-zone entries need city overrides.
const COUNTRY_TIME_ZONES = {
  Afghanistan: 'Asia/Kabul',
  Algeria: 'Africa/Algiers',
  Angola: 'Africa/Luanda',
  Argentina: 'America/Argentina/Buenos_Aires',
  Austria: 'Europe/Vienna',
  Bahrain: 'Asia/Bahrain',
  Bangladesh: 'Asia/Dhaka',
  Belarus: 'Europe/Minsk',
  Belgium: 'Europe/Brussels',
  Bolivia: 'America/La_Paz',
  Botswana: 'Africa/Gaborone',
  Brazil: 'America/Sao_Paulo',
  Brunei: 'Asia/Brunei',
  Bulgaria: 'Europe/Sofia',
  Cambodia: 'Asia/Phnom_Penh',
  Chile: 'America/Santiago',
  China: 'Asia/Shanghai',
  Colombia: 'America/Bogota',
  'Costa Rica': 'America/Costa_Rica',
  Croatia: 'Europe/Zagreb',
  Cuba: 'America/Havana',
  Czechia: 'Europe/Prague',
  Denmark: 'Europe/Copenhagen',
  'Dominican Republic': 'America/Santo_Domingo',
  'DR Congo': 'Africa/Kinshasa',
  Ecuador: 'America/Guayaquil',
  Egypt: 'Africa/Cairo',
  'El Salvador': 'America/El_Salvador',
  Ethiopia: 'Africa/Addis_Ababa',
  Fiji: 'Pacific/Fiji',
  Finland: 'Europe/Helsinki',
  France: 'Europe/Paris',
  'French Polynesia': 'Pacific/Tahiti',
  Germany: 'Europe/Berlin',
  Ghana: 'Africa/Accra',
  Greece: 'Europe/Athens',
  Guatemala: 'America/Guatemala',
  Honduras: 'America/Tegucigalpa',
  Hungary: 'Europe/Budapest',
  Iceland: 'Atlantic/Reykjavik',
  India: 'Asia/Kolkata',
  Indonesia: 'Asia/Jakarta',
  Iran: 'Asia/Tehran',
  Iraq: 'Asia/Baghdad',
  Ireland: 'Europe/Dublin',
  Israel: 'Asia/Jerusalem',
  Italy: 'Europe/Rome',
  'Ivory Coast': 'Africa/Abidjan',
  Jamaica: 'America/Jamaica',
  Japan: 'Asia/Tokyo',
  Jordan: 'Asia/Amman',
  Kazakhstan: 'Asia/Almaty',
  Kenya: 'Africa/Nairobi',
  Kuwait: 'Asia/Kuwait',
  Laos: 'Asia/Vientiane',
  Lebanon: 'Asia/Beirut',
  Libya: 'Africa/Tripoli',
  Madagascar: 'Indian/Antananarivo',
  Malaysia: 'Asia/Kuala_Lumpur',
  Mali: 'Africa/Bamako',
  Mexico: 'America/Mexico_City',
  Mongolia: 'Asia/Ulaanbaatar',
  Morocco: 'Africa/Casablanca',
  Mozambique: 'Africa/Maputo',
  Myanmar: 'Asia/Yangon',
  Namibia: 'Africa/Windhoek',
  Nepal: 'Asia/Kathmandu',
  Netherlands: 'Europe/Amsterdam',
  'New Caledonia': 'Pacific/Noumea',
  'New Zealand': 'Pacific/Auckland',
  Nicaragua: 'America/Managua',
  Nigeria: 'Africa/Lagos',
  Norway: 'Europe/Oslo',
  Oman: 'Asia/Muscat',
  Pakistan: 'Asia/Karachi',
  Panama: 'America/Panama',
  'Papua New Guinea': 'Pacific/Port_Moresby',
  Paraguay: 'America/Asuncion',
  Peru: 'America/Lima',
  Philippines: 'Asia/Manila',
  Poland: 'Europe/Warsaw',
  Portugal: 'Europe/Lisbon',
  'Puerto Rico': 'America/Puerto_Rico',
  Qatar: 'Asia/Qatar',
  Romania: 'Europe/Bucharest',
  Russia: 'Europe/Moscow',
  'Saudi Arabia': 'Asia/Riyadh',
  Senegal: 'Africa/Dakar',
  Serbia: 'Europe/Belgrade',
  Singapore: 'Asia/Singapore',
  'Solomon Islands': 'Pacific/Guadalcanal',
  'South Africa': 'Africa/Johannesburg',
  'South Korea': 'Asia/Seoul',
  Spain: 'Europe/Madrid',
  'Sri Lanka': 'Asia/Colombo',
  Sudan: 'Africa/Khartoum',
  Sweden: 'Europe/Stockholm',
  Switzerland: 'Europe/Zurich',
  Syria: 'Asia/Damascus',
  Taiwan: 'Asia/Taipei',
  Tanzania: 'Africa/Dar_es_Salaam',
  Thailand: 'Asia/Bangkok',
  'Timor-Leste': 'Asia/Dili',
  Tunisia: 'Africa/Tunis',
  Turkey: 'Europe/Istanbul',
  UAE: 'Asia/Dubai',
  Uganda: 'Africa/Kampala',
  Ukraine: 'Europe/Kyiv',
  'United Kingdom': 'Europe/London',
  'United States': 'America/New_York',
  Uruguay: 'America/Montevideo',
  Uzbekistan: 'Asia/Tashkent',
  Venezuela: 'America/Caracas',
  Vietnam: 'Asia/Ho_Chi_Minh',
  Yemen: 'Asia/Aden',
  Zambia: 'Africa/Lusaka',
  Zimbabwe: 'Africa/Harare',
};

const CITY_TIME_ZONE_OVERRIDES = {
  Cordoba: 'America/Argentina/Cordoba',
  Manaus: 'America/Manaus',
  'Porto Alegre': 'America/Sao_Paulo',
  'Kota Kinabalu': 'Asia/Kuching',
  Surabaya: 'Asia/Jakarta',
  Denpasar: 'Asia/Makassar',
  Medan: 'Asia/Jakarta',
  Novosibirsk: 'Asia/Novosibirsk',
  Vladivostok: 'Asia/Vladivostok',
  Tromso: 'Europe/Oslo',
  Tijuana: 'America/Tijuana',
  Monterrey: 'America/Monterrey',
  Toronto: 'America/Toronto',
  Montreal: 'America/Toronto',
  Vancouver: 'America/Vancouver',
  Calgary: 'America/Edmonton',
  Ottawa: 'America/Toronto',
  Winnipeg: 'America/Winnipeg',
  'Los Angeles': 'America/Los_Angeles',
  Chicago: 'America/Chicago',
  Houston: 'America/Chicago',
  Phoenix: 'America/Phoenix',
  'San Antonio': 'America/Chicago',
  'San Diego': 'America/Los_Angeles',
  Dallas: 'America/Chicago',
  'San Francisco': 'America/Los_Angeles',
  Seattle: 'America/Los_Angeles',
  Denver: 'America/Denver',
  Minneapolis: 'America/Chicago',
  'Las Vegas': 'America/Los_Angeles',
  Honolulu: 'Pacific/Honolulu',
  Anchorage: 'America/Anchorage',
  Sydney: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Brisbane: 'Australia/Brisbane',
  Perth: 'Australia/Perth',
  Adelaide: 'Australia/Adelaide',
  Canberra: 'Australia/Sydney',
  Darwin: 'Australia/Darwin',
  Hobart: 'Australia/Hobart',
};

export const WORLD_CITIES = Object.freeze(
  CITY_DATA.map(([name, country, latitude, longitude], index) => ({
    id: `city_${index}`,
    name,
    country,
    latitude,
    longitude,
    timeZone: CITY_TIME_ZONE_OVERRIDES[name] || COUNTRY_TIME_ZONES[country],
  })),
);

function normalize(value) {
  return (
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      // Strip combining marks so "Cordoba" finds "Córdoba" and vice versa.
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  );
}

const SEARCH_INDEX = WORLD_CITIES.map((city) => ({
  city,
  name: normalize(city.name),
  country: normalize(city.country),
}));

/**
 * Search cities by name or country.
 *
 * Ranking puts name-prefix matches first, then name substrings, then country
 * matches — so typing "man" offers Manila and Manchester before Oman.
 */
export function searchCities(query, limit = 8) {
  const needle = normalize(query);
  if (needle.length < 2) return [];

  const scored = [];
  for (const entry of SEARCH_INDEX) {
    let score = -1;
    if (entry.name.startsWith(needle)) score = 0;
    else if (entry.name.includes(needle)) score = 1;
    else if (entry.country.startsWith(needle)) score = 2;
    else if (entry.country.includes(needle)) score = 3;
    if (score >= 0) scored.push({ score, entry });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((item) => item.entry.city);
}

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const dLat = (b.latitude - a.latitude) * DEG;
  const dLon = (b.longitude - a.longitude) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Closest listed city to a point, with its distance. Used to name a spot the
 * user clicked on the map, so an arbitrary click still reads as somewhere.
 */
export function nearestCity(point) {
  if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const city of WORLD_CITIES) {
    const distance = distanceKm(point, city);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = city;
    }
  }
  return best ? { city: best, distanceKm: bestDistance } : null;
}
