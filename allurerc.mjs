// Allure 3 report configuration (npm run allure:generate / allure:open)
export default {
  name: 'Niramoy Prescription API',
  output: './allure-report',
  // Keeps trend/history between local runs; CI restores it from cache.
  historyPath: './allure-history/history.jsonl',
  plugins: {
    awesome: {
      options: {
        reportName: 'Niramoy Prescription API',
        reportLanguage: 'en',
        // Same tree as the tests/ folder: Advices › "Advices - CRUD" › test
        groupBy: ['module', 'section'],
      },
    },
  },
};
