const delay = ms => new Promise(res => setTimeout(res, ms));

const waitIntervalMs = 50;

// Increment for each cardinal direction change, in degrees
const fetchTileIncrement = 1;

export default async ({data, page, crawler}) => {
  await page.setRequestInterception(true);

  let mapBoxURLs = [];
  let fontsURLs = [];

  page.on("request", request => {
    const url = request.url();
    if (url.includes(".json")) {
      mapBoxURLs.push(url);
    }
    if (url.includes("fonts")) {
      fontsURLs.push(url);
    }
    request.continue();
  });

  await crawler.loadPage(page, data);

  const zoomButton = await page.$("button.mapboxgl-ctrl-icon:nth-child(1)");
  // Zoom in 3 times to get all the font names
  await zoomButton.click();
  await zoomButton.click();
  await zoomButton.click();

  await fetchFonts(page, fontsURLs);
  await fetchTiles(page, mapBoxURLs);
};

async function getMapBoxJson(url) {
  console.log(`getting json for ${url}`);
  return await fetch(url).then((response) => {
    return response.json();
  });
}

function dedupeFonts(fontsURLs) {
  const setOfFonts = new Set();
  for (let fontIndex = 0; fontIndex < fontsURLs.length; fontIndex++) {
    let font = fontsURLs[fontIndex];
    font = font.replace(/[0-9]{1,5}-[0-9]{1,5}\.pbf/, "{i}-{j}.pbf");
    setOfFonts.add(font);
  }
  return Array.from(setOfFonts);
}

async function fetchFonts(page, fontsURLs) {
  const dedupedFontURLs = dedupeFonts(fontsURLs);
  for (let fontIndex = 0; fontIndex < dedupedFontURLs.length; fontIndex++) {
    let ogFontURL = dedupedFontURLs[fontIndex];
    for (let i = 0; i <= 65280; i += 256) {
      let currentFontURL = ogFontURL;
      currentFontURL = currentFontURL.replace("{i}", i);
      currentFontURL = currentFontURL.replace("{j}", i+255);
      const status = await page.evaluate(params => {
        return fetch(params.currentFontURL).then(res => res.status);
      }, {currentFontURL});
      console.log(currentFontURL, status);
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
