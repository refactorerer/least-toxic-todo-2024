// import { PGlite } from "@electric-sql/pglite";
// import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";

(() => {
  console.log("asdfasdfasdfsadf");

  import(
    "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js"
  ).then((module) => {
    window.globalThis.pg = module;
  });
})();
