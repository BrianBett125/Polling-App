const isVitest = !!process.env.VITEST || process.env.NODE_ENV === 'test';
const config = {
  // Disable PostCSS plugins during Vitest to avoid Vite loading errors
  plugins: isVitest ? [] : ["@tailwindcss/postcss"],
};

export default config;
