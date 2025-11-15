import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

// Sanity check
console.log("Mapbox GL JS loaded:", mapboxgl);

// 1) Set your access token (from your Mapbox account dashboard)
mapboxgl.accessToken = "pk.eyJ1IjoidXphaXJnaGVld2FsYSIsImEiOiJjbWkwdmRoMnowYXl2MmtvZWIxeDg3OWhyIn0._rJb0p4KKYm2XupV8Dsxuw";

// 2) Create the map
const map = new mapboxgl.Map({
  container: "map", // matches <div id="map">
  style: "mapbox://styles/mapbox/streets-v12", // you can swap for a custom style later
  center: [-71.09415, 42.36027], // [lng, lat] (Cambridge / MIT-ish area)
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Optional: add zoom/rotation controls
map.addControl(new mapboxgl.NavigationControl(), "top-left");