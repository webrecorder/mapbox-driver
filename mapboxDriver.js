const delay = ms => new Promise(res => setTimeout(res, ms));

// Time to wait after each API call to Mapbox, in milliseconds (ms)
const waitIntervalMs = 50;

// Increment for each cardinal direction change, in degrees
const fetchTileIncrement = 1;

export default async ({data, page, crawler}) => {
  await page.setRequestInterception(true);

  let mapBoxURLs = [];
  
  page.on("request", request => {
    const url = request.url();
    if (url.includes(".json")) {
      mapBoxURLs.push(url);
    }
    
    request.continue();
  });

  await crawler.loadPage(page, data);

  //await fetchFonts(page, accessToken);
  await fetchTiles(page, mapBoxURLs);
};

function getAccessToken(url) {
  // Get access token from Mapbox URL
  const RX = /^(.*)access_token=(.*)$/;
  const m = url.match(RX);
  if (!m) {
    return "";
  }
  return m[2];
}

async function getMapBoxJson(url) {
  console.log(`getting json for ${url}`);
  return await fetch(url).then((response) => {
    return response.json();
  });
}

async function fetchFonts(page, accessToken) {
  for (let i = 0; i <= 65280; i += 256) {
    const medium_font_url = `https://api.mapbox.com/fonts/v1/propublica/DIN%20Offc%20Pro%20Medium,Arial%20Unicode%20MS%20Regular/${i}-${i+255}.pbf?access_token=${accessToken}`;
    const regular_font_url = `https://api.mapbox.com/fonts/v1/propublica/DIN%20Offc%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/${i}-${i+255}.pbf?access_token=${accessToken}`;
    const bold_font_url = `https://api.mapbox.com/fonts/v1/propublica/DIN%20Offc%20Pro%20Bold,Arial%20Unicode%20MS%20Regular/${i}-${i+255}.pbf?access_token=${accessToken}`;
    const urls = [medium_font_url, regular_font_url, bold_font_url];
    for (let j = 0; j < urls.length; j++) {
      const url = urls[j];
      const status = await page.evaluate(params => {
        return fetch(params.url).then(res => res.status);
      }, {url});
      console.log(url, status);
    }
  }
}

async function fetchTiles(page, mapBoxURLs) {
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
  for (let jsonIndex = 0; jsonIndex < mapBoxURLs.length; jsonIndex++) {
    let json = await getMapBoxJson(mapBoxURLs[jsonIndex]);
    try {
      const [westernBound, southernBound, easternBound, northernBound] = json["bounds"];
      const minZoomLevel = json["minzoom"];
      const maxZoomLevel = json["maxzoom"];
      const tileSets = json["tiles"];
      for (let x = westernBound; x <= easternBound; x+= fetchTileIncrement) {
        for (let y = southernBound; y <= northernBound; y+= fetchTileIncrement) {
          for (let z = minZoomLevel; z <= maxZoomLevel; z+= 1) {
            // Calculate location
            const tileX = lon2tile(x, z);
            const tileY = lat2tile(y, z);
            console.log(`Longitude: ${x}; Latitude: ${y}; Zoom: ${z}`);

            // Fetch vector tiles from a.tiles.mapbox.com and b.tiles.mapbox.com
            for (let t = 0; t < tileSets.length; t++) {
              let url = tileSets[t];
              url = url.replace("{x}", tileX);
              url = url.replace("{y}", tileY);
              url = url.replace("{z}", z);
              const status = await page.evaluate(params => {
                return fetch(params.url).then(res => res.status);
              }, {url});

              console.log(url, status);

              await delay(waitIntervalMs);
            }
          }
        }
      }   
    } catch (TypeError) {
      console.log(`Unable to parse JSON for ${mapBoxURLs[jsonIndex]}`);
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
