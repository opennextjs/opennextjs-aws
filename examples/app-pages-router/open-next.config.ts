const config = {
  default: {},
  functions: {
    api: {
      routes: [
        "app/api/client/route",
        "app/api/host/route",
        "app/api/request-headers-app/route",
        "pages/api/hello",
        "pages/api/request-headers-pages",
      ],
      patterns: ["/api/*"],
    },
  },
  dangerous: {
    enableCacheInterception: true,
  },
  buildCommand: "npx turbo build",
};

module.exports = config;
