import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { PrescriptionSettingsApi } from '@api/index';
import { checkSchema } from '@openapi/validator';
import { prescriptionSettings } from '@data/prescriptionSettings';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: PrescriptionSettings (print layout: header, footer, signature)
// Settings resolve chamber -> doctor -> default; `source` in the response says which level was used.
//
// SAFETY: write tests only touch a random test chamber (chamberId), never the doctor's own settings,
// and the doctor-level settings are compared before and after the run.

const withSettings = (changes: { header?: object; footer?: object; signature?: object } = {}) => {
  const s = prescriptionSettings();
  return {
    header: { ...s.header, ...changes.header },
    footer: { ...s.footer, ...changes.footer },
    signature: { ...s.signature, ...changes.signature },
  };
};

test.describe('Prescription settings - read @smoke', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /prescription-settings returns the doctor settings', async ({ prescriptionSettings: api }) => {
    const data = (await api.getSettings(doctorId)).expectStatus(200);
    expect(data.doctorId).toBe(doctorId);
    expect(['doctor', 'default']).toContain(data.source);
    expect(data.settings).toEqual(expect.objectContaining({
      header: expect.any(Object), footer: expect.any(Object), signature: expect.any(Object),
    }));
  });

  test('GET with a chamber that has no settings falls back to the doctor settings', async ({ prescriptionSettings: api }) => {
    const doctorLevel = (await api.getSettings(doctorId)).expectStatus(200);
    const chamberId = crypto.randomUUID();
    const data = (await api.getSettings(doctorId, chamberId)).expectStatus(200);
    expect(data.chamberId).toBe(chamberId);
    expect(data.source).toBe(doctorLevel.source);
    expect(data.settings).toEqual(doctorLevel.settings);
  });

  test('GET for a doctor without settings returns the defaults', async ({ prescriptionSettings: api }) => {
    const data = (await api.getSettings(crypto.randomUUID())).expectStatus(200);
    expect(data.source).toBe('default');
    expect(data.settings.header.enabled).toBe(false);
    expect(data.settings.footer.enabled).toBe(false);
    expect(data.settings.signature.enabled).toBe(false);
    expect(data.settings.footer.qrCode).toBe('betterHealth');
  });

  test('GET /prescription-settings/get-all-by-doctorId lists every saved level', async ({ prescriptionSettings: api }) => {
    const data = (await api.getAllByDoctorId(doctorId)).expectStatus(200);
    expect(Array.isArray(data)).toBe(true);
    // Swagger documents the list inline, so each item is validated against PrescriptionSettingsSummaryDto here.
    for (const item of data) expect(checkSchema('PrescriptionSettingsSummaryDto', item), `item ${item.id}`).toEqual([]);
    const ids = data.map((x: any) => x.id);
    expect(new Set(ids).size, 'ids are unique').toBe(ids.length);
    const chambers = data.map((x: any) => x.chamberId ?? 'doctor-level');
    expect(new Set(chambers).size, 'one record per chamber').toBe(chambers.length);
  });
});

test.describe('Prescription settings - chamber lifecycle @crud', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  // One test per lifecycle: the test chamber's settings are deleted after the test even if a step fails.
  test('save, read, update and delete settings for a test chamber', async ({ prescriptionSettings: api }) => {
    const chamberId = crypto.randomUUID();
    const settings = withSettings();
    const doctorLevelBefore = JSON.stringify((await api.getSettings(doctorId)).data);

    await test.step('PUT /prescription-settings saves settings for a chamber', async () => {
      const data = (await api.save({ doctorId, chamberId, settings })).expectStatus(200);
      expect(data).toMatchObject({ doctorId, chamberId, source: 'chamber' });
      expect(data.settings).toEqual(settings);
    });

    await test.step('GET with that chamber returns the saved settings', async () => {
      const data = (await api.getSettings(doctorId, chamberId)).expectStatus(200);
      expect(data.source).toBe('chamber');
      expect(data.settings).toEqual(settings);
    });

    await test.step('the chamber appears once in get-all-by-doctorId', async () => {
      const data = (await api.getAllByDoctorId(doctorId)).expectStatus(200);
      const mine = data.filter((x: any) => x.chamberId === chamberId);
      expect(mine).toHaveLength(1);
      expect(mine[0].header.doctorName).toEqual(settings.header.doctorName);
    });

    await test.step('PUT again updates the same record (no duplicate)', async () => {
      const updated = withSettings({ header: { height: 150, tagline: 'updated' }, footer: { qrCode: 'betterHealth' } });
      (await api.save({ doctorId, chamberId, settings: updated })).expectStatus(200);

      const data = (await api.getSettings(doctorId, chamberId)).expectStatus(200);
      expect(data.settings.header).toMatchObject({ height: 150, tagline: 'updated' });
      expect(data.settings.footer.qrCode).toBe('betterHealth');

      const all = (await api.getAllByDoctorId(doctorId)).expectStatus(200);
      const mine = all.filter((x: any) => x.chamberId === chamberId);
      expect(mine).toHaveLength(1);
      expect(mine[0].modifiedAt, 'modifiedAt set on update').toBeTruthy();
    });

    await test.step('PUT accepts the maximum heights (header 400 pt, footer 200 pt)', async () => {
      const data = (await api.save({ doctorId, chamberId, settings: withSettings({ header: { height: 400 }, footer: { height: 200 } }) })).expectStatus(200);
      expect(data.settings.header.height).toBe(400);
      expect(data.settings.footer.height).toBe(200);
    });

    await test.step('DELETE /prescription-settings removes the chamber settings', async () => {
      (await api.remove(doctorId, chamberId)).expectStatus(200);
      const data = (await api.getSettings(doctorId, chamberId)).expectStatus(200);
      expect(data.source, 'falls back to the doctor level').not.toBe('chamber');
    });

    await test.step('DELETE again returns 404', async () => {
      (await api.remove(doctorId, chamberId)).expectNotFound();
    });

    await test.step('the doctor-level settings were not changed', async () => {
      expect(JSON.stringify((await api.getSettings(doctorId)).data)).toBe(doctorLevelBefore);
    });
  });
});

test.describe('Prescription settings - preview', () => {
  for (const paper of ['a4', 'thermal80'] as const) {
    test(`POST /prescription-settings/preview renders a ${paper} PDF`, async ({ prescriptionSettings: api }) => {
      const res = await api.preview({ settings: withSettings(), paper, doctorId });
      expect(res.status).toBe(200);
      expect(res.response.headers()['content-type']).toContain('application/pdf');
      expect((await res.response.body()).subarray(0, 4).toString()).toBe('%PDF');
      res.expectResponseTime().expectMaxSize(2048);
    });
  }

  test('preview does not save anything', async ({ prescriptionSettings: api }) => {
    test.skip(!doctorId, NEED_DOCTOR);
    // The preview uses a unique doctor name; it must not show up in any saved record afterwards.
    // (Comparing the whole list would race with the chamber lifecycle tests running in parallel.)
    const settings = withSettings();
    const doctorLevelBefore = JSON.stringify((await api.getSettings(doctorId)).data);
    expect((await api.preview({ settings, paper: 'a4', doctorId })).status).toBe(200);
    const all = (await api.getAllByDoctorId(doctorId)).expectStatus(200);
    expect(all.some((x: any) => x.header?.doctorName?.en === settings.header.doctorName.en)).toBe(false);
    expect(JSON.stringify((await api.getSettings(doctorId)).data)).toBe(doctorLevelBefore);
  });
});

test.describe('Prescription settings - validation', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Rejected requests save nothing, so these use a throwaway chamber id.
  const save = (api: PrescriptionSettingsApi, settings: object) => api.save({ doctorId, chamberId: crypto.randomUUID(), settings });

  test('GET without doctorId returns 400', async ({ prescriptionSettings: api }) => {
    (await api.getSettings()).expectValidationError('doctorId');
  });

  test('get-all-by-doctorId without doctorId returns 400', async ({ prescriptionSettings: api }) => {
    (await api.getAllByDoctorId()).expectValidationError('doctorId');
  });

  test('PUT without doctorId returns 400', async ({ prescriptionSettings: api }) => {
    (await api.save({ chamberId: crypto.randomUUID(), settings: withSettings() })).expectValidationError('doctorId');
  });

  test('PUT requires the doctor name in English and Bangla', async ({ prescriptionSettings: api }) => {
    (await save(api, withSettings({ header: { doctorName: { en: '', bn: '' } } })))
      .expectValidationError('DoctorName.En')
      .expectValidationError('DoctorName.Bn');
  });

  test('PUT requires at least one degree and one speciality', async ({ prescriptionSettings: api }) => {
    (await save(api, withSettings({ header: { degrees: [], specialities: [] } })))
      .expectValidationError('Header.Degrees')
      .expectValidationError('Header.Specialities');
  });

  test('PUT requires the BMDC registration number', async ({ prescriptionSettings: api }) => {
    (await save(api, withSettings({ header: { bmdcRegistrationNo: { en: '', bn: '' } } }))).expectValidationError('BmdcRegistrationNo');
  });

  test('PUT rejects header height above 400 pt and footer height above 200 pt', async ({ prescriptionSettings: api }) => {
    (await save(api, withSettings({ header: { height: 401 }, footer: { height: 201 } })))
      .expectValidationError('Header.Height')
      .expectValidationError('Footer.Height');
  });

  test('PUT rejects negative heights', async ({ prescriptionSettings: api }) => {
    (await save(api, withSettings({ header: { height: -1 } }))).expectValidationError('Header.Height');
  });

  test('PUT rejects an unknown qrCode mode', async ({ prescriptionSettings: api }) => {
    await knownBug('returns a raw ProblemDetails without the { success, error } envelope.');
    (await save(api, withSettings({ footer: { qrCode: 'nope' } }))).expectValidationError('qrCode');
  });

  test('preview rejects an unknown paper size', async ({ prescriptionSettings: api }) => {
    await knownBug('returns a raw ProblemDetails without the { success, error } envelope.');
    (await api.preview({ settings: withSettings(), paper: 'a3' })).expectValidationError('paper');
  });

  test('preview validates the settings like PUT', async ({ prescriptionSettings: api }) => {
    (await api.preview({ settings: withSettings({ header: { degrees: [] } }), paper: 'a4' })).expectValidationError('Header.Degrees');
  });

  test('DELETE for a doctor without saved settings returns 404', async ({ prescriptionSettings: api }) => {
    (await api.remove(crypto.randomUUID())).expectNotFound();
  });
});

test.describe('Prescription settings - security', () => {
  test('requests without a token return 401', async ({ anon }) => {
    (await anon(PrescriptionSettingsApi).getSettings(crypto.randomUUID())).expectUnauthorized();
    (await anon(PrescriptionSettingsApi).getAllByDoctorId(crypto.randomUUID())).expectUnauthorized();
    (await anon(PrescriptionSettingsApi).preview({ settings: withSettings(), paper: 'a4' })).expectUnauthorized();
  });
});
