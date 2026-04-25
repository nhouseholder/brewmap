// BrewMap — Pure Utility Functions

export function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(miles) {
  return miles < 0.1 ? Math.round(miles * 5280) + ' ft' : miles.toFixed(1) + ' mi';
}

export function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildAddress(tags) {
  const p = [];
  if (tags['addr:housenumber'] && tags['addr:street']) p.push(tags['addr:housenumber'] + ' ' + tags['addr:street']);
  else if (tags['addr:street']) p.push(tags['addr:street']);
  if (tags['addr:city']) p.push(tags['addr:city']);
  if (tags['addr:state']) p.push(tags['addr:state']);
  return p.join(', ');
}
