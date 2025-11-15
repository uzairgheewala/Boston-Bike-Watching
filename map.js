import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// Sanity check
console.log("Mapbox GL JS loaded:", mapboxgl);

// 1) Set your access token (from your Mapbox account dashboard)
mapboxgl.accessToken = "pk.eyJ1IjoidXphaXJnaGVld2FsYSIsImEiOiJjbWkwdmRoMnowYXl2MmtvZWIxeDg3OWhyIn0._rJb0p4KKYm2XupV8Dsxuw";

// ---------- Helpers (top-level) ----------

// minutes since midnight for a Date
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Format minutes since midnight as human time ("2:30 PM")
function formatTime(minutes) {
  const d = new Date(0, 0, 0, 0, minutes);
  return d.toLocaleString("en-US", { timeStyle: "short" });
}

// Filter trips to those within ±60 minutes of timeFilter
function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) {
    console.log("[filterTripsByTime] timeFilter=-1 → returning ALL trips", trips.length);
    return trips;
  }

  const filtered = trips.filter((trip) => {
    const startMin = minutesSinceMidnight(trip.started_at);
    const endMin = minutesSinceMidnight(trip.ended_at);

    return (
      Math.abs(startMin - timeFilter) <= 60 ||
      Math.abs(endMin - timeFilter) <= 60
    );
  });

  console.log(
    `[filterTripsByTime] timeFilter=${timeFilter} mins → filtered trips:`,
    filtered.length
  );
  return filtered;
}

// Compute arrivals/departures/totalTraffic per station
function computeStationTraffic(baseStations, tripsSubset) {
  console.log(
    "[computeStationTraffic] baseStations:",
    baseStations.length,
    "tripsSubset:",
    tripsSubset.length
  );

  const departures = d3.rollup(
    tripsSubset,
    (v) => v.length,
    (d) => d.start_station_id
  );
  const arrivals = d3.rollup(
    tripsSubset,
    (v) => v.length,
    (d) => d.end_station_id
  );

  console.log(
    "[computeStationTraffic] departures keys:",
    departures.size,
    "arrivals keys:",
    arrivals.size
  );

  const stationsWithTraffic = baseStations.map((station) => {
    const id = station.short_name;
    const dep = departures.get(id) ?? 0;
    const arr = arrivals.get(id) ?? 0;
    return {
      ...station,
      departures: dep,
      arrivals: arr,
      totalTraffic: dep + arr,
    };
  });

  console.log(
    "[computeStationTraffic] sample stations with traffic (first 5):",
    stationsWithTraffic.slice(0, 5)
  );
  return stationsWithTraffic;
}

// Quantize scale for departure ratio → 0 / 0.5 / 1
const stationFlow = d3
  .scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

// ---------- Map init ----------

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
  console.log("[map] load event fired");

  // ---- Bike lane layers ----
  const bikeLanePaint = {
    "line-color": "#32D400",
    "line-width": 2.5,
    "line-opacity": 0.6,
  };

  console.log("[map] Adding Boston bike lane source & layer");
  map.addSource("boston_bike_lanes", {
    type: "geojson",
    data:
      "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "boston-bike-lanes",
    type: "line",
    source: "boston_bike_lanes",
    paint: bikeLanePaint,
  });

  console.log("[map] Adding Cambridge bike lane source & layer");
  map.addSource("cambridge_bike_lanes", {
    type: "geojson",
    data: "assets/cambridge.geojson",
  });

  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_bike_lanes",
    paint: bikeLanePaint,
  });

  // ---- SVG overlay + stations ----

  let svg = d3.select("#map").select("svg");
  console.log("[SVG] Initial selection:", svg.node());

  if (svg.empty()) {
    console.warn(
      "[SVG] No <svg> found inside #map. Creating one programmatically."
    );
    svg = d3.select("#map").append("svg");
    console.log("[SVG] New svg created:", svg.node());
  }

  // Map lon/lat → screen coords
  function getCoords(station) {
    const lngLat = new mapboxgl.LngLat(station.lon, station.lat);
    const { x, y } = map.project(lngLat);
    return { cx: x, cy: y };
  }

  // Load station JSON
  console.log("[stations] Fetching station JSON...");
  const stationsRaw = await d3.json("assets/bluebikes-stations.json");
  console.log("[stations] Raw JSON loaded:", stationsRaw);

  let baseStations = stationsRaw.data?.stations ?? stationsRaw;
  console.log("[stations] baseStations raw length:", baseStations?.length);

  // Normalize station structure
  baseStations = (baseStations ?? [])
    .map((s) => {
      const short = s.short_name ?? s.Number ?? s.station_id;
      return {
        id: s.Number ?? s.station_id ?? short,
        short_name: short,
        name: s.NAME ?? s.name,
        lat: +(s.lat ?? s.Lat),
        lon: +(s.lon ?? s.Long),
        raw: s,
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

  console.log(
    "[stations] After normalization & filter, count:",
    baseStations.length
  );
  console.log("[stations] Sample (first 5):", baseStations.slice(0, 5));

  if (baseStations.length === 0) {
    console.warn(
      "[stations] No valid stations after normalization. Circles will not render."
    );
  }

  // Load trips CSV + parse dates
  console.log("[trips] Fetching trips CSV...");
  const trips = await d3.csv(
    "assets/bluebikes-traffic-2024-03.csv",
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    }
  );

  console.log("[trips] Loaded trips:", trips.length);
  console.log("[trips] Sample trip:", trips[0]);

  // Initial traffic using all trips
  let stations = computeStationTraffic(baseStations, trips);

  const maxTotalTraffic = d3.max(stations, (d) => d.totalTraffic) || 0;
  console.log("[radiusScale] max totalTraffic:", maxTotalTraffic);

  // Radius scale (sqrt) for totalTraffic
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, maxTotalTraffic || 1])
    .range([0, 25]);

  console.log(
    "[radiusScale] domain:",
    radiusScale.domain(),
    "range:",
    radiusScale.range()
  );

  // Draw circles with data join
  let circles = svg
    .selectAll("circle")
    .data(stations, (d) => d.short_name)
    .join("circle")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("opacity", 0.7)
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .style("--departure-ratio", (d) =>
        d.totalTraffic > 0
        ? stationFlow(d.departures / d.totalTraffic)
        : 0.5 // neutral grey-ish when no traffic
    )
    .each(function (d) {
        d3.select(this).select("title").remove();
        d3.select(this)
        .append("title")
        .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });

  console.log(
    "[circles] Number of circles after initial join:",
    svg.selectAll("circle").size()
  );
  console.log(
    "[circles] Sample radii (first 5):",
    stations.slice(0, 5).map((s) => ({
      short_name: s.short_name,
      totalTraffic: s.totalTraffic,
      r: radiusScale(s.totalTraffic),
    }))
  );

  // Position circles
  function updatePositions() {
    // For debugging, log only once per call
    let firstCoords = null;

    circles
      .attr("cx", (d) => {
        const c = getCoords(d);
        if (!firstCoords) {
          firstCoords = { station: d.short_name, ...c };
        }
        return c.cx;
      })
      .attr("cy", (d) => {
        const c = getCoords(d);
        return c.cy;
      });

    if (firstCoords) {
      console.log("[updatePositions] Example projected coords:", firstCoords);
    }
  }

  updatePositions();

  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);

  // ---- Time slider wiring ----

  const timeSlider = document.querySelector("#time-slider");
  const selectedTime = document.querySelector("#selected-time");
  const anyTimeLabel = document.querySelector("#any-time");

  console.log("[slider] Elements:", {
    timeSlider,
    selectedTime,
    anyTimeLabel,
  });

  function updateTimeDisplayAndFilter() {
    const timeFilter = Number(timeSlider.value);
    console.log("[slider] New timeFilter value:", timeFilter);

    if (timeFilter === -1) {
      selectedTime.textContent = "";
      anyTimeLabel.style.display = "block";
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = "none";
    }

    // Filter trips and recompute traffic
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(
      baseStations,
      filteredTrips
    );

    const maxTraffic =
      d3.max(filteredStations, (d) => d.totalTraffic) || 0;

    console.log(
      "[updateTimeDisplayAndFilter] maxTraffic:",
      maxTraffic,
      "filteredStations:",
      filteredStations.length
    );

    // Bigger range when filtered, smaller when showing everything
    if (timeFilter === -1) {
      radiusScale.range([0, 25]);
    } else {
      radiusScale.range([3, 50]);
    }
    radiusScale.domain([0, maxTraffic || 1]);

    console.log(
      "[radiusScale] Updated domain:",
      radiusScale.domain(),
      "range:",
      radiusScale.range()
    );

    stations = filteredStations;

    circles = svg
        .selectAll("circle")
        .data(stations, (d) => d.short_name)
        .join("circle")
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("opacity", 0.7)
        .attr("r", (d) => radiusScale(d.totalTraffic))
        .style("--departure-ratio", (d) =>
            d.totalTraffic > 0
            ? stationFlow(d.departures / d.totalTraffic)
            : 0.5
        )
        .each(function (d) {
            d3.select(this).select("title").remove();
            d3.select(this)
            .append("title")
            .text(
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
        });

    console.log(
      "[circles] After filter, circle count:",
      svg.selectAll("circle").size()
    );

    // Reposition with updated data
    updatePositions();
  }

  timeSlider.addEventListener("input", updateTimeDisplayAndFilter);
  // initial render
  updateTimeDisplayAndFilter();
});