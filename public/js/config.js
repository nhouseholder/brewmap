// BrewMap — Configuration Constants

export const FLAVOR_TAGS = ['dark','bold','rich','toasty','nutty','chocolatey','smoky','medium','balanced','smooth','clean','mild','fruity','bright','tart','citrus','berry','floral','sweet','caramel','vanilla','earthy','spicy','herbal','complex','acidic'];

export const FLAVOR_BAR_COLORS = {
  dark:'#8B5A2B',bold:'#B4503C',rich:'#A05050',toasty:'#C88C3C',nutty:'#B48C50',
  chocolatey:'#785032',smoky:'#64646E',medium:'#64A064',balanced:'#5D9DE8',smooth:'#64B4A0',
  clean:'#8CC8DC',mild:'#B4B4B4',fruity:'#E85DA8',bright:'#E8B45D',tart:'#E85D5D',
  citrus:'#E8C85D',berry:'#A85DE8',floral:'#C882DC',sweet:'#E8935D',caramel:'#D2A050',
  vanilla:'#E6DCB4',earthy:'#788250',spicy:'#C8503C',herbal:'#50A050',complex:'#A87DE8',
  acidic:'#C8DC3C'
};

export const CITIES = {
  nyc: { name: 'New York, NY', lat: 40.7128, lng: -74.0060, zoom: 12, defaultRadius: 5 },
  phoenix: { name: 'Phoenix, AZ', lat: 33.4484, lng: -112.0740, zoom: 12, defaultRadius: 5 },
  galveston: { name: 'Galveston, TX', lat: 29.3013, lng: -94.7977, zoom: 12, defaultRadius: 5 },
  current: { name: 'My Location', lat: null, lng: null, zoom: 12, defaultRadius: 5 }
};
