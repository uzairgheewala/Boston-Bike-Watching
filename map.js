import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// Sanity check
console.log("Mapbox GL JS loaded:", mapboxgl);

// 1) Set your access token (from your Mapbox account dashboard)
mapboxgl.accessToken = "pk.eyJ1IjoidXphaXJnaGVld2FsYSIsImEiOiJjbWkwdmRoMnowYXl2MmtvZWIxeDg3OWhyIn0._rJb0p4KKYm2XupV8Dsxuw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.addControl(new mapboxgl.NavigationControl(), "top-left");

map.on("load", async () => {
  // ---- Bike lane layers (unchanged) ----
  const bikeLanePaint = {
    "line-color": "#32D400",
    "line-width": 2.5,
    "line-opacity": 0.6,
  };

  map.addSource("boston_bike_lanes", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "boston-bike-lanes",
    type: "line",
    source: "boston_bike_lanes",
    paint: bikeLanePaint,
  });

  map.addSource("cambridge_bike_lanes", {
    type: "geojson",
    data: "YOUR_CAMBRIDGE_BIKE_LANES_GEOJSON_URL_HERE",
  });

  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_bike_lanes",
    paint: bikeLanePaint,
  });

  // ---- SVG overlay + stations ----

  // Select the SVG overlay inside #map
  const svg = d3.select("#map").select("svg");

  // Helper: project station lon/lat -> screen x/y using Mapbox
  function getCoords(station) {
    const lngLat = new mapboxgl.LngLat(station.lon, station.lat);
    const { x, y } = map.project(lngLat);
    return { cx: x, cy: y };
  }

  // Load Bluebikes station JSON
  const stationsRaw = await d3.json(
    "https://dsc106.com/labs/lab07/data/bluebikes-stations.json"
  );

  // Many Bluebikes JSONs are nested under data.stations
  let stations = stationsRaw.data?.stations ?? stationsRaw;

  // Normalize to consistent {id, name, lat, lon, ...}
  stations = stations
    .map((s) => ({
      id: s.Number ?? s.short_name ?? s.station_id,
      name: s.NAME ?? s.name,
      lat: +(s.lat ?? s.Lat),
      lon: +(s.lon ?? s.Long),
      raw: s,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

  // Draw one circle per station
  const circles = svg
    .selectAll("circle")
    .data(stations)
    .enter()
    .append("circle")
    .attr("r", 5)
    .attr("fill", "steelblue")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("opacity", 0.8);

  // Keep station markers aligned with the map as it moves/zooms
  function updatePositions() {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }

  // Initial placement
  updatePositions();

  // Reposition markers on map interactions
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);
});