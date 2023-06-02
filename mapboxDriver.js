const delay = ms => new Promise(res => setTimeout(res, ms));

const RX = /^(.*)access_token=(.*)$/;

// GEOGRAPHIC BOUNDS: latitude/longitude, in degrees
// TODO: Figure out what these should be from Mapbox API
// getBoundsFromApi below was an attempt, but the bounds returned
// from that endpoint covered the entire world map

// For https://projects.propublica.org/miseducation/ page
// const northernBound = 49.382808;
// const southernBound = 24.521208;
// const easternBound = -66.945392;
// const westernBound = -124.736342;

// For testing: Massachusetts
const northernBound = 42.886589;
const southernBound = 41.237964;
const easternBound = -69.928393;
const westernBound = -73.508142;

// TODO: Figure out what these should be from Mapbox API
const minZoomLevel = 2;
const maxZoomLevel = 8;

// Time to wait after each API call to Mapbox, in milliseconds (ms)
const waitIntervalMs = 200;

// Increment for each cardinal direction change, in degrees
const fetchTileIncrement = 1;

// TODO: Figure out what these should be from Mapbox API
const tileSets = [
	"mapbox.mapbox-streets-v7",
	"propublica.schools-countries",
	"mapbox.mapbox-terrain-v2",
	"propublica.schools-states",
	"propublica.opp_gap-districts-black",
	"propublica.opp_gap-districts-hispanic"
];

const tilesBaseUrlA = "https://a.tiles.mapbox.com/v4/";
const tilesBaseUrlB = "https://b.tiles.mapbox.com/v4/"
const tileFormat = ".vector.pbf";


export default async ({data, page, crawler}) => {
  await page.setRequestInterception(true);

  let accessToken = "";
  
  page.on("request", request => {
    const url = request.url();

  	if (accessToken.length === 0) {
  		const tokenAttempt = getAccessToken(url);
	  	if (tokenAttempt.length > 0) {
	  		accessToken = tokenAttempt;
	  	}
  	}
  	
    request.continue();
  });

  await crawler.loadPage(page, data);

  await fetchTiles(page, accessToken);
};

function getAccessToken(url) {
	// Get access token from Mapbox URL
  const m = url.match(RX);
  if (!m) {
    return "";
  }
  return m[2];
}

async function fetchTiles(page, accessToken) {
	// This approach works by iterating through the various longitudes, latitudes,
	// and zoom levels specified above, fetching vector tiles from the Vector Tile API
	// for each coordinate pair.
	//
	// It will go west to east, south to north, min zoom layer to max zoom layer, and
	// tileset by tileset, fetching the vector tiles for the entire map in the browser.
	// 
	// Settings:
	//
	// - `fetchTileIncrement`: The increment for each cardinal direction change, in degrees.
	// - `waitInternalMs`: The wait interval in millisceonds after each Mapbox API call
	//
	// Fair warning: at higher zoom levels or for big maps, this may return a loooot of tiles.
	// There's almost certainly lots of room to optimize here. Mapbox asks that API requests
	// are kept under 100,000 calls/min, and will rame limit if that is exceeded.
	for (let x = westernBound; x <= easternBound; x+= fetchTileIncrement) {
    for (let y = southernBound; y <= northernBound; y+= fetchTileIncrement) {
    	for (let z = minZoomLevel; z <= maxZoomLevel; z+= 1) {
  			// Calculate location
    		const tileX = lon2tile(x, z);
    		const tileY = lat2tile(y, z);
    		console.log(`Longitude: ${x}; Latitude: ${y}; Zoom: ${z}`);

    		// Fetch vector tiles from a.tiles.mapbox.com and b.tiles.mapbox.com
    		for (let t = 0; t < tileSets.length; t++) {
    			const tileset = tileSets[t];
    			const urlA = `${tilesBaseUrlA}${tileset}/${z}/${tileX}/${tileY}${tileFormat}?access_token=${accessToken}`;
    			const urlB = `${tilesBaseUrlB}${tileset}/${z}/${tileX}/${tileY}${tileFormat}?access_token=${accessToken}`;

    			const fetchUrls = [urlA, urlB];
	    		for (let i = 0; i < fetchUrls.length; i++) {
	    			const url = fetchUrls[i];
	    			const status = await page.evaluate(params => {
	  					return fetch(params.url).then(res => res.status);
		    		}, {url});

		    		console.log(url, status);

		    		await delay(waitIntervalMs);
		    	}
    		}
    	}
    }
  }  	
}

function lon2tile(lon, zoom) {
	// Source: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_(JavaScript/ActionScript,_etc.)
	return (Math.floor((lon+180)/360*Math.pow(2,zoom))); 
}

function lat2tile(lat, zoom) {
	// Source: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_(JavaScript/ActionScript,_etc.)
	return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
}

// async function getBoundsFromApi(token) {
// 	// Fetch info on all datasets, including bounds
// 	// TODO: Generalize this to work with dataset list gathered from requests
// 	// TODO: Datasets that are fetched separately on site but included below:
// 	// https://api.mapbox.com/v4/propublica.opp_gap-districts-black.json?secure&access_token=TOKEN
// 	// https://api.mapbox.com/v4/propublica.opp_gap-districts-hispanic.json?secure&access_token=TOKEN

// 	// TODO: These bounds may not actually be very useful, they seem to be
//   // returning a region covering the whole world - but the `center` value
//   // returned by that API might be a good starting point?
//   // To call:
//   // const bounds = await getBoundsFromApi(accessToken);

//   const fetchUrl = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v7,propublica.schools-countries,mapbox.mapbox-terrain-v2,propublica.schools-states,propublica.opp_gap-districts-black,propublica.opp_gap-districts-hispanic.json?secure&access_token=${token}`;
//   const r = await fetch(fetchUrl);
//   const data = await r.json();
//   console.log(data);
//   return data.bounds;
// }
