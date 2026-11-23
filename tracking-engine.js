// Local, API-independent reference data and movement calculations for Magic Hour shipment journeys.
export const AIRPORTS = [
  ["LOS","DNMM","Murtala Muhammed International","Lagos","Nigeria",6.5774,3.3212],
  ["ABV","DNAA","Nnamdi Azikiwe International","Abuja","Nigeria",9.0068,7.2632],
  ["KAN","DNKN","Mallam Aminu Kano International","Kano","Nigeria",12.0476,8.5246],
  ["PHC","DNPO","Port Harcourt International","Port Harcourt","Nigeria",5.0155,6.9496],
  ["ENU","DNEN","Akanu Ibiam International","Enugu","Nigeria",6.4743,7.5619],
  ["LHR","EGLL","Heathrow Airport","London","United Kingdom",51.4700,-0.4543],
  ["LGW","EGKK","Gatwick Airport","London","United Kingdom",51.1537,-0.1821],
  ["MAN","EGCC","Manchester Airport","Manchester","United Kingdom",53.3537,-2.2750],
  ["JFK","KJFK","John F. Kennedy International","New York","United States",40.6413,-73.7781],
  ["LAX","KLAX","Los Angeles International","Los Angeles","United States",33.9416,-118.4085],
  ["ORD","KORD","Chicago O'Hare International","Chicago","United States",41.9742,-87.9073],
  ["ATL","KATL","Hartsfield-Jackson Atlanta","Atlanta","United States",33.6407,-84.4277],
  ["DFW","KDFW","Dallas Fort Worth International","Dallas","United States",32.8998,-97.0403],
  ["MIA","KMIA","Miami International","Miami","United States",25.7959,-80.2870],
  ["SFO","KSFO","San Francisco International","San Francisco","United States",37.6213,-122.3790],
  ["IAD","KIAD","Washington Dulles International","Washington","United States",38.9531,-77.4565],
  ["DXB","OMDB","Dubai International","Dubai","United Arab Emirates",25.2532,55.3657],
  ["AUH","OMAA","Zayed International","Abu Dhabi","United Arab Emirates",24.4330,54.6511],
  ["FRA","EDDF","Frankfurt Airport","Frankfurt","Germany",50.0379,8.5622],
  ["MUC","EDDM","Munich Airport","Munich","Germany",48.3538,11.7861],
  ["CDG","LFPG","Charles de Gaulle Airport","Paris","France",49.0097,2.5479],
  ["AMS","EHAM","Amsterdam Airport Schiphol","Amsterdam","Netherlands",52.3105,4.7683],
  ["YYZ","CYYZ","Toronto Pearson International","Toronto","Canada",43.6777,-79.6248],
  ["YVR","CYVR","Vancouver International","Vancouver","Canada",49.1967,-123.1815],
  ["JNB","FAOR","O. R. Tambo International","Johannesburg","South Africa",-26.1367,28.2411],
  ["CPT","FACT","Cape Town International","Cape Town","South Africa",-33.9715,18.6021],
  ["NBO","HKJK","Jomo Kenyatta International","Nairobi","Kenya",-1.3192,36.9278],
  ["ACC","DGAA","Kotoka International","Accra","Ghana",5.6052,-0.1668],
  ["IST","LTFM","Istanbul Airport","Istanbul","Turkey",41.2753,28.7519],
  ["DEL","VIDP","Indira Gandhi International","Delhi","India",28.5562,77.1000],
  ["BOM","VABB","Chhatrapati Shivaji Maharaj International","Mumbai","India",19.0896,72.8656],
  ["PEK","ZBAA","Beijing Capital International","Beijing","China",40.0799,116.6031],
  ["PVG","ZSPD","Shanghai Pudong International","Shanghai","China",31.1443,121.8083],
  ["CAN","ZGGG","Guangzhou Baiyun International","Guangzhou","China",23.3924,113.2988],
  ["SIN","WSSS","Singapore Changi Airport","Singapore","Singapore",1.3644,103.9915],
  ["HND","RJTT","Tokyo Haneda Airport","Tokyo","Japan",35.5494,139.7798],
  ["ICN","RKSI","Incheon International","Seoul","South Korea",37.4602,126.4407],
  ["SYD","YSSY","Sydney Kingsford Smith","Sydney","Australia",-33.9399,151.1753],
  ["MEL","YMML","Melbourne Airport","Melbourne","Australia",-37.6690,144.8410],
  ["GRU","SBGR","São Paulo Guarulhos","São Paulo","Brazil",-23.4356,-46.4731],
  ["MEX","MMMX","Mexico City International","Mexico City","Mexico",19.4361,-99.0719],
  ["MAD","LEMD","Adolfo Suárez Madrid-Barajas","Madrid","Spain",40.4983,-3.5676],
  ["FCO","LIRF","Rome Fiumicino Airport","Rome","Italy",41.8003,12.2389],
  ["ZRH","LSZH","Zurich Airport","Zurich","Switzerland",47.4581,8.5555],
  ["DOH","OTHH","Hamad International","Doha","Qatar",25.2731,51.6081],
  ["RUH","OERK","King Khalid International","Riyadh","Saudi Arabia",24.9576,46.6988],
  ["KUL","WMKK","Kuala Lumpur International","Kuala Lumpur","Malaysia",2.7456,101.7072],
  ["HKG","VHHH","Hong Kong International","Hong Kong","Hong Kong",22.3080,113.9185],
  ["ADD","HAAB","Addis Ababa Bole International","Addis Ababa","Ethiopia",8.9779,38.7993],
  ["CAI","HECA","Cairo International","Cairo","Egypt",30.1219,31.4056]
].map(([iata,icao,name,city,country,lat,lng])=>({iata,icao,name,city,country,lat,lng}));

export const AIRCRAFT_MODELS = [
  "Airbus A220-300","Airbus A319","Airbus A320","Airbus A320neo","Airbus A321neo","Airbus A330-200","Airbus A330-300","Airbus A330neo","Airbus A350-900","Airbus A350-1000","Airbus A380-800",
  "Boeing 737-700","Boeing 737-800","Boeing 737 MAX 8","Boeing 737 MAX 9","Boeing 747-8F","Boeing 767-300F","Boeing 777-200LR","Boeing 777-300ER","Boeing 777F","Boeing 787-8","Boeing 787-9","Boeing 787-10",
  "ATR 42-600","ATR 72-600","Embraer E175","Embraer E190-E2","Embraer E195-E2","Cessna 208 Caravan","Antonov An-124","Other / not specified"
];

export const CARRIERS = [
  "GIG Logistics","FedEx","FedEx Express","DHL","DHL Express","UPS","UPS Airlines","Aramex","USPS","Royal Mail","DPD","Evri","Canada Post","Australia Post","Japan Post","China Post","EMS","SF Express","J&T Express","Nipost","Sendbox","Kwik Delivery","Konga Logistics","Knight-Swift","Local courier","Other carrier"
];

export const AIRLINES = [
  "Air Peace","United Nigeria Airlines","Arik Air","Ibom Air","Green Africa Airways","Rano Air","Overland Airways","British Airways","Virgin Atlantic","easyJet","American Airlines","Delta Air Lines","United Airlines","Emirates","Etihad Airways","flydubai","Qatar Airways","Turkish Airlines","Lufthansa","Air France","KLM","Ryanair","Iberia","ITA Airways","Air Canada","WestJet","South African Airways","FlySafair","Kenya Airways","Ethiopian Airlines","Africa World Airlines","EgyptAir","Air India","IndiGo","Singapore Airlines","Cathay Pacific","China Southern","Air China","Japan Airlines","ANA","Qantas","Malaysia Airlines","LATAM","Avianca"
];

const CITY_COORDS = {
  "lagos|nigeria":[6.5244,3.3792],"abuja|nigeria":[9.0765,7.3986],"kano|nigeria":[12.0022,8.5920],"port harcourt|nigeria":[4.8156,7.0498],"enugu|nigeria":[6.4584,7.5464],
  "london|united kingdom":[51.5072,-0.1276],"manchester|united kingdom":[53.4808,-2.2426],"liverpool|united kingdom":[53.4084,-2.9916],"birmingham|united kingdom":[52.4862,-1.8904],"glasgow|united kingdom":[55.8642,-4.2518],
  "new york|united states":[40.7128,-74.0060],"los angeles|united states":[34.0522,-118.2437],"chicago|united states":[41.8781,-87.6298],"atlanta|united states":[33.7490,-84.3880],"miami|united states":[25.7617,-80.1918],"dallas|united states":[32.7767,-96.7970],"san francisco|united states":[37.7749,-122.4194],"washington|united states":[38.9072,-77.0369],
  "dubai|united arab emirates":[25.2048,55.2708],"abu dhabi|united arab emirates":[24.4539,54.3773],"sharjah|united arab emirates":[25.3463,55.4209],
  "frankfurt|germany":[50.1109,8.6821],"berlin|germany":[52.5200,13.4050],"munich|germany":[48.1351,11.5820],"hamburg|germany":[53.5511,9.9937],
  "paris|france":[48.8566,2.3522],"lyon|france":[45.7640,4.8357],"marseille|france":[43.2965,5.3698],
  "amsterdam|netherlands":[52.3676,4.9041],"rotterdam|netherlands":[51.9244,4.4777],
  "toronto|canada":[43.6532,-79.3832],"vancouver|canada":[49.2827,-123.1207],"montreal|canada":[45.5019,-73.5674],
  "johannesburg|south africa":[-26.2041,28.0473],"cape town|south africa":[-33.9249,18.4241],"durban|south africa":[-29.8587,31.0218],
  "nairobi|kenya":[-1.2921,36.8219],"mombasa|kenya":[-4.0435,39.6682],"accra|ghana":[5.6037,-0.1870],"kumasi|ghana":[6.6885,-1.6244],
  "istanbul|turkey":[41.0082,28.9784],"ankara|turkey":[39.9334,32.8597],"delhi|india":[28.6139,77.2090],"mumbai|india":[19.0760,72.8777],"bengaluru|india":[12.9716,77.5946],
  "beijing|china":[39.9042,116.4074],"shanghai|china":[31.2304,121.4737],"guangzhou|china":[23.1291,113.2644],"singapore|singapore":[1.3521,103.8198],
  "tokyo|japan":[35.6762,139.6503],"seoul|south korea":[37.5665,126.9780],"sydney|australia":[-33.8688,151.2093],"melbourne|australia":[-37.8136,144.9631],
  "sao paulo|brazil":[-23.5505,-46.6333],"mexico city|mexico":[19.4326,-99.1332],"madrid|spain":[40.4168,-3.7038],"rome|italy":[41.9028,12.4964],"zurich|switzerland":[47.3769,8.5417],
  "doha|qatar":[25.2854,51.5310],"riyadh|saudi arabia":[24.7136,46.6753],"kuala lumpur|malaysia":[3.1390,101.6869],"hong kong|hong kong":[22.3193,114.1694],"addis ababa|ethiopia":[8.9806,38.7578],"cairo|egypt":[30.0444,31.2357]
};

const COUNTRY_CENTERS = {
  "nigeria":[9.0820,8.6753],"united kingdom":[54.5,-3.0],"united states":[39.5,-98.35],"united arab emirates":[24.2,54.4],"germany":[51.1,10.4],"france":[46.2,2.2],"netherlands":[52.2,5.3],"canada":[56.1,-106.3],"south africa":[-29.0,24.0],"kenya":[0.2,37.9],"ghana":[7.9,-1.0],"turkey":[39.0,35.0],"india":[22.0,79.0],"china":[35.9,104.2],"singapore":[1.35,103.82],"japan":[36.2,138.3],"south korea":[36.5,127.9],"australia":[-25.3,133.8],"brazil":[-10.8,-52.9],"mexico":[23.6,-102.5],"spain":[40.2,-3.7],"italy":[42.8,12.8],"switzerland":[46.8,8.2],"qatar":[25.3,51.2],"saudi arabia":[23.9,45.1],"malaysia":[4.2,102.0],"hong kong":[22.3,114.2],"ethiopia":[9.1,40.5],"egypt":[26.8,30.8]
};

const key = (city,country) => (String(city||"").trim().toLowerCase()+"|"+String(country||"").trim().toLowerCase());
export function resolveShipmentPlace(city,country,airportCode=""){
  const code=String(airportCode||"").trim().toUpperCase();
  if(code){const airport=AIRPORTS.find(a=>a.iata===code||a.icao===code);if(airport)return [airport.lat,airport.lng];}
  const cityKey=key(city,country);
  if(CITY_COORDS[cityKey])return [...CITY_COORDS[cityKey]];
  const airport=AIRPORTS.find(a=>a.city.toLowerCase()===String(city||"").trim().toLowerCase()&&a.country.toLowerCase()===String(country||"").trim().toLowerCase());
  if(airport)return [airport.lat,airport.lng];
  const center=COUNTRY_CENTERS[String(country||"").trim().toLowerCase()];
  return center?[...center]:null;
}

export function haversineKm(a,b){
  const rad=Math.PI/180,dLat=(b[0]-a[0])*rad,dLng=(b[1]-a[1])*rad;
  const q=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}
export function buildShipmentRoute(from,to,mode="road",steps=100){
  const [aLat,aLng]=from,[bLat,bLng]=to,rad=Math.PI/180,deg=180/Math.PI;
  const lat1=aLat*rad,lon1=aLng*rad,lat2=bLat*rad,lon2=bLng*rad;
  const dot=Math.max(-1,Math.min(1,Math.sin(lat1)*Math.sin(lat2)+Math.cos(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1)));
  const omega=Math.acos(dot),sin=Math.sin(omega),points=[];
  const seed=Math.abs(Math.round((aLat*31+aLng*17+bLat*13+bLng*7)*1000))%997;
  const bend=mode==="road"?0.055:mode==="sea"?0.09:0;
  for(let i=0;i<=steps;i++){
    const t=i/steps,A=sin?Math.sin((1-t)*omega)/sin:1-t,B=sin?Math.sin(t*omega)/sin:t;
    const x=A*Math.cos(lat1)*Math.cos(lon1)+B*Math.cos(lat2)*Math.cos(lon2);
    const y=A*Math.cos(lat1)*Math.sin(lon1)+B*Math.cos(lat2)*Math.sin(lon2);
    const z=A*Math.sin(lat1)+B*Math.sin(lat2);
    let lat=Math.atan2(z,Math.hypot(x,y))*deg,lng=Math.atan2(y,x)*deg;
    if(bend){const offset=Math.sin(Math.PI*t)*bend*Math.sin((seed%13)+t*Math.PI*2);lat+=offset;lng+=Math.sin(Math.PI*t)*bend*Math.cos((seed%17)+t*Math.PI*2);}
    points.push([lat,lng]);
  }
  return points;
}
export function routeMetrics(points,mode="road"){
  let km=0;for(let i=1;i<points.length;i++)km+=haversineKm(points[i-1],points[i]);
  const factor=mode==="road"?1.18:mode==="sea"?1.12:1;
  const distance=km*factor,speed=mode==="air"?780:mode==="sea"?32:68;
  return {distanceKm:Math.round(distance),estimatedMinutes:Math.max(30,Math.round(distance/speed*60+(mode==="air"?90:mode==="sea"?240:35)))};
}
export function positionOnRoute(points,progress){
  if(!Array.isArray(points)||points.length<2)return points?.[0]||null;
  const lengths=[];let total=0;for(let i=1;i<points.length;i++){const d=haversineKm(points[i-1],points[i]);lengths.push(d);total+=d;}
  let remaining=total*Math.max(0,Math.min(1,progress));
  for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const t=lengths[i]?remaining/lengths[i]:0;return [points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t];}remaining-=lengths[i];}
  return points[points.length-1];
}
export function shipmentProgressAt(shipment,now=Date.now()){
  if(shipment?.is_obstructed||shipment?.status==="blocked")return Math.max(0,Math.min(1,Number(shipment.paused_progress??shipment.progress_percent??0)/100));
  const start=new Date(shipment?.departure_at).getTime(),end=new Date(shipment?.arrival_at).getTime();
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start){
    const paused=Math.max(0,Number(shipment.paused_duration_seconds)||0)*1000;
    return Math.max(0,Math.min(1,(now-start-paused)/(end-start)));
  }
  return Math.max(0,Math.min(1,Number(shipment?.progress_percent||0)/100));
}
export function createCheckpointPlan(points,departureAt,arrivalAt){
  const start=new Date(departureAt).getTime(),end=new Date(arrivalAt).getTime();
  return [0.18,0.38,0.62,0.82].map((progress,index)=>({
    id:"CP"+String(index+1).padStart(2,"0"),
    title:["Departure corridor","Route checkpoint 1","Route checkpoint 2","Arrival corridor"][index],
    progress,
    expected_at:new Date(start+(end-start)*progress).toISOString(),
    position:positionOnRoute(points,progress)
  }));
}
