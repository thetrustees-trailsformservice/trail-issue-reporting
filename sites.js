// Configuration file for monitoring sites
// Each site has a center point and default zoom

const sites = {
  "Armstrong-Kelley Park": {
    center: [41.62920684379889, -70.38081967178935],
    zoom: 17,
    boundary: "assets/boundaries/Armstrong_Kelley_Park.geojson",
    trails: "assets/trails/AKP_Trails.geojson"
  },
  "Cape Poge Wildlife Refuge": {
    center: [41.389665710343884, -70.45165847770149],
    zoom: 15,
    boundary: "assets/boundaries/Cape_Poge_Wildlife_Refuge.geojson",
    trails: "assets/trails/CPWR_Trails.geojson"
  },
  "Copicut Woods": {
    center: [41.702917864842725, -71.05962294808069],
    zoom: 14,
    boundary: "assets/boundaries/Copicut_Woods.geojson",
    trails: "assets/trails/CW_Trails.geojson"
  },
  "Cornell Farm": {
    center: [41.555852996742516, -70.96138939183496],
    zoom: 15,
    boundary: "assets/boundaries/Cornell_Farm.geojson",
    trails: "assets/trails/CF_Trails.geojson"
  },
  "Coskata-Coatue Wildlife Refuge": {
    center: [41.35599210412687, -70.0245909081541],
    zoom: 15,
    boundary: "assets/boundaries/Coskata_Coatue_Wildlife_Refuge.geojson",
    trails: "assets/trails/CCWR_Trails.geojson"
  },
  "East Over Reservation": {
    center: [41.74783800245519, -70.81160886775267],
    zoom: 16,
    boundary: "assets/boundaries/East_Over_Reservation.geojson",
    trails: "assets/trails/EOR_Trails.geojson"
  },
  "East Over: Hales Brook and Sippican River": {
    center: [41.7396176529525, -70.78087923250978],
    zoom: 15,
    boundary: "assets/boundaries/East_Over_Hales_Brook_and_Sippican_River.geojson",
    trails: "assets/trails/HBSR_Trails.geojson"
  },
  "Eleanor Cabot Bradley Estate": {
    center: [42.20013585373492, -71.12443643509431],
    zoom: 15,
    boundary: "assets/boundaries/Eleanor_Cabot_Bradley_Estate.geojson",
    trails: "assets/trails/ECBE_Trails.geojson"
  },
  "Francis William Bird Park": {
    center: [42.1570053981131, -71.21648717080619],
    zoom: 15,
    boundary: "assets/boundaries/Francis_William_Bird_Park.geojson",
    trails: "assets/trails/FWBP_Trails.geojson"
  },
  "Governor Oliver Ames Estate": {
    center: [42.070533334751076, -71.1001010474235],
    zoom: 16,
    boundary: "assets/boundaries/Gov_Oliver_Ames_Estate.geojson",
    trails: "assets/trails/GOAE_Trails.geojson"
  },
  "Long Point Wildlife Refuge": {
    center: [41.36019278710403, -70.63241273422653],
    zoom: 15,
    boundary: "assets/boundaries/Long_Point_Wildlife_Refuge.geojson",
    trails: "assets/trails/LPWR_Trails.geojson"
  },
  "Lowell Holly": {
    center: [41.66630999698034, -70.4816220377386],
    zoom: 14,
    boundary: "assets/boundaries/Lowell_Holly.geojson",
    trails: "assets/trails/LH_Trails.geojson"
  },
  "Lyman Reserve": {
    center: [41.768804992054434, -70.63282250109933],
    zoom: 15,
    boundary: "assets/boundaries/Lyman_Reserve.geojson",
    trails: "assets/trails/LR_Trails.geojson"
  },
  "Mashpee River Reservation": {
    center: [41.62848145494261, -70.48261419320067],
    zoom: 14,
    boundary: "assets/boundaries/Mashpee_River_Reservation.geojson",
    trails: "assets/trails/MRR_Trails.geojson"
  },
  "Menemsha Hills and Brickyard Reservation": {
    center: [41.369181530171886, -70.74922377044606],
    zoom: 15,
    boundary: "assets/boundaries/Menemsha_Hills.geojson",
    trails: "assets/trails/MHBR_Trails.geojson"
  },
  "Moose Hill Farm": {
    center: [42.13060787935361, -71.21280601546168],
    zoom: 14,
    boundary: "assets/boundaries/Moose_Hill_Farm.geojson",
    trails: "assets/trails/MHF_Trails.geojson"
  },
  "Norris Reservation": {
    center: [42.15583757030394, -70.78673193707866],
    zoom: 15,
    boundary: "assets/boundaries/Norris_Reservation.geojson",
    trails: "assets/trails/NR_Trails.geojson"
  },
  "Signal Hill Reservation": {
    center: [42.18627810038251, -71.16073926438779],
    zoom: 15,
    boundary: "assets/boundaries/Signal_Hill.geojson",
    trails: "assets/trails/SH_Trails.geojson"
  },
  "Slocum's River Reserve": {
    center: [41.55313566930044, -71.00625303356446],
    zoom: 15,
    boundary: "assets/boundaries/Slocums_River_Reserve.geojson",
    trails: "assets/trails/SRR_Trails.geojson"
  },
  "Two Mile Farm": {
    center: [42.23991792827818, -70.85773397995227],
    zoom: 15,
    boundary: "assets/boundaries/Two_Mile_Farm.geojson",
    trails: "assets/trails/TMF_Trails.geojson"
  },
  "Wasque": {
    center: [41.35194030292235, -70.45933568696691],
    zoom: 15,
    boundary: "assets/boundaries/Wasque.geojson",
    trails: "assets/trails/WSQ_Trails.geojson"
  },
  "Westport Town Farm": {
    center: [41.58037783738651, -71.07768462503394],
    zoom: 16,
    boundary: "assets/boundaries/Westport_Town_Farm.geojson",
    trails: "assets/trails/WTF_Trails.geojson"
  },
  "Whitney and Thayer Woods/Weir River Farm/Turkey Hill": {
    center: [42.23190813345651, -70.83950609048523],
    zoom: 14,
    boundary: "assets/boundaries/Whitney_Thayer_Weir_River_Turkey_Hill.geojson",
    trails: "assets/trails/WTWRTH_Trails.geojson"
  },
  "World's End": {
    center: [42.26496229308216, -70.87566639296985],
    zoom: 14,
    boundary: "assets/boundaries/Worlds_End.geojson",
    trails: "assets/trails/WE_Trails.geojson"
  }
};
