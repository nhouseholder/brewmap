// BrewMap — Centralized Application State

export let map = null;
export let userLat = null;
export let userLng = null;
export let userMarker = null;
export let allShops = [];
export let filteredShops = [];
export let activeFlavorFilters = new Set();
export let markers = {};
export let selectedShopId = null;
export let radiusMiles = 5;
export let currentCity = 'nyc';
export let hasUsedLocation = false;
export let currentScanController = null;
export let cachedCities = null;
export let dataSource = 'overpass';
export let currentDataUpdatedAt = null;
export let currentDataSourceMode = 'overpass';
export let verifiedOnly = false;
export let activeIntentId = '';
export let scanRequestToken = 0;
export let lastScanRadius = 0;
export let activeRoastFilter = '';

// Setters (to allow mutation from other modules)
export function setMap(v) { map = v; }
export function setUserLat(v) { userLat = v; }
export function setUserLng(v) { userLng = v; }
export function setUserMarker(v) { userMarker = v; }
export function setAllShops(v) { allShops = v; }
export function setFilteredShops(v) { filteredShops = v; }
export function setActiveFlavorFilters(v) { activeFlavorFilters = v; }
export function setMarkers(v) { markers = v; }
export function setSelectedShopId(v) { selectedShopId = v; }
export function setRadiusMiles(v) { radiusMiles = v; }
export function setCurrentCity(v) { currentCity = v; }
export function setHasUsedLocation(v) { hasUsedLocation = v; }
export function setCurrentScanController(v) { currentScanController = v; }
export function setCachedCities(v) { cachedCities = v; }
export function setDataSource(v) { dataSource = v; }
export function setCurrentDataUpdatedAt(v) { currentDataUpdatedAt = v; }
export function setCurrentDataSourceMode(v) { currentDataSourceMode = v; }
export function setVerifiedOnly(v) { verifiedOnly = v; }
export function setActiveIntentId(v) { activeIntentId = v; }
export function setScanRequestToken(v) { scanRequestToken = v; }
export function setLastScanRadius(v) { lastScanRadius = v; }
export function setActiveRoastFilter(v) { activeRoastFilter = v; }
