// Where the packaged desktop app loads the product from.
//
// A packaged app has no dev server and no shell env vars, so the hosted URL is
// baked in here. During development, set CLUELY_URL (e.g. http://localhost:3000)
// to point at your local Next server instead.
const PROD_URL = "https://cluely-delta.vercel.app";

module.exports = {
  APP_URL: process.env.CLUELY_URL || (require("electron").app.isPackaged ? PROD_URL : "http://localhost:3000"),
};
