export default {
  locales: [
    "en",
    "ru"
  ],
  extract: {
    input: "src/**/*.{js,jsx,ts,tsx}",
    output: "src\\i18n\\locales\\{{language}}\\common.json"
  }
}