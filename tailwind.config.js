/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    screens: {
      mobile: { max: "767px" },
      tablet: { min: "768px", max: "1279px" },
      "tablet-lg": { min: "1024px", max: "1279px" },
      desktop: { min: "1280px" },
      wide: { min: "1536px" },
      // 保留默认断点作为通用参考
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {},
  },
  plugins: [],
};
