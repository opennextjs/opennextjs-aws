module.exports = {
  plugins: {
    tailwindcss: {
      content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "../../packages/core/**/*.{jsx,tsx}"],
    },
    autoprefixer: {},
  },
};
