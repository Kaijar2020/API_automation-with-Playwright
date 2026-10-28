import { test, expect } from '@fixtures';
import { MedicineFormulationConfigsApi } from '@api/index';

// Swagger tag: MedicineFormulationConfigs

test.describe('Medicine formulation configs @smoke', () => {
  test('GET /medicine-formulation-configs lists formulations', async ({ formulationConfigs }) => {
    const data = (await formulationConfigs.getAll()).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test('GET /medicine-formulation-configs/lookup returns the lookup table', async ({ formulationConfigs }) => {
    (await formulationConfigs.lookup()).expectStatus(200);
  });

  test('GET /medicine-formulation-configs/by-code/{code} returns that formulation', async ({ formulationConfigs }) => {
    const [first] = (await formulationConfigs.getAll()).expectStatus(200);
    const one = (await formulationConfigs.getByCode(first.formulationCode)).expectStatus(200);
    expect(JSON.stringify(one)).toContain(first.formulationCode);
  });

  test('GET /medicine-formulation-configs/by-code/{code} with unknown code returns 404', async ({ formulationConfigs }) => {
    (await formulationConfigs.getByCode('does-not-exist')).expectNotFound();
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(MedicineFormulationConfigsApi).getAll()).expectUnauthorized();
  });
});
