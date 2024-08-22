const config = {
  default: {},
  functions: {
    api: {
      routes: ["app/api/client/route", "app/api/host/route", "pages/api/hello"],
      patterns: ["/api/*"],
    },
  },
  dangerous: {
    enableCacheInterception: true,
  },
  buildCommand: "npx turbo build",
};

module.exports = config;
