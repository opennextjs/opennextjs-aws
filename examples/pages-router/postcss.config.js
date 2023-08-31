module.exports = {
  plugins: {
    tailwindcss: {
      content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "../../examples/shared/**/*.{jsx,tsx}",
      ],
    },
    autoprefixer: {},
  },
};
