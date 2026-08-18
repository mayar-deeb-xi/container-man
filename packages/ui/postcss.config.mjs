/**
 * Shared PostCSS setup. Tailwind v4 needs no config file — the theme lives in
 * src/styles/globals.css — so apps just re-export this.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
