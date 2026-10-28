import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { TemplatesApi } from '@api/index';
import { templatePayload } from '@data/payloads';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: Templates

test.describe('Templates', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /Templates lists the doctor templates @smoke', async ({ templates }) => {
    const data = (await templates.getAll({ doctorId, pageSize: 5 })).expectStatus(200);
    for (const t of data) expect(t.doctorId).toBe(doctorId);
  });

  test('GET /Templates/search filters by type', async ({ templates }) => {
    const data = (await templates.search({ doctorId, templateType: 'treatment', searchTerm: 'a' })).expectStatus(200);
    for (const t of data) expect(t.templateType).toBe('treatment');
  });

  test.describe('CRUD @crud', () => {
    test('create, read, find, update and delete a template', async ({ templates }) => {
      const body = templatePayload(doctorId!);

      const id = await test.step('POST /Templates creates a template (201)', async () => {
        const data = (await templates.create(body)).expectStatus(201);
        expect(data).toMatchObject({ doctorId, name: body.name, shortcut: body.shortcut, templateType: 'treatment' });
        return data.id as string;
      });

      await test.step('GET /Templates/{id} returns the medicines of a treatment template', async () => {
        const data = (await templates.getById(id)).expectStatus(200);
        expect(data).toMatchObject({ id, name: body.name, templateType: 'treatment' });
        expect(data.medicines).toHaveLength(1);
        expect(data.medicines[0]).toMatchObject({ brandName: 'Metformin', strength: '500 mg' });
        // Templates are type-specific: a treatment template keeps only medicines, other sections are dropped.
        expect(data.advices ?? []).toHaveLength(0);
      });

      await test.step('created template is found by list and search', async () => {
        const list = (await templates.getAll({ doctorId, templateType: 'treatment', pageSize: 50 })).expectStatus(200);
        expect(list.map((t: any) => t.id)).toContain(id);
        // Search only returns results when templateType is given (Swagger marks it optional).
        const found = (await templates.search({ doctorId, templateType: 'treatment', searchTerm: 'diabetes' })).expectStatus(200);
        expect(found.map((t: any) => t.id)).toContain(id);
      });

      await test.step('PUT /Templates/{id} updates name and removes medicines', async () => {
        const { doctorId: _, ...update } = { ...templatePayload(doctorId!), name: `${body.name} v2`, medicines: [] };
        (await templates.update(id, update)).expectStatus(200);
        const data = (await templates.getById(id)).expectStatus(200);
        expect(data.name).toBe(update.name);
        expect(data.medicines ?? []).toHaveLength(0);
      });

      await test.step('DELETE /Templates/{id} removes the template', async () => {
        (await templates.remove(id)).expectStatus([200, 204]);
        expect((await templates.getById(id)).status).toBe(404);
      });
    });
  });

  test('POST /Templates with an invalid templateType returns 400', async ({ templates }) => {
    await knownBug('returns a raw ProblemDetails without the { success, error } envelope.');
    (await templates.create({ ...templatePayload(doctorId!), templateType: 'nope' })).expectValidationError('templateType');
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(TemplatesApi).getAll()).expectUnauthorized();
});

test.describe('Templates - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  test('GET, PUT and DELETE with an unknown id return 404', async ({ templates }) => {
    const id = crypto.randomUUID();
    const { doctorId: _, ...update } = templatePayload(doctorId!);
    (await templates.getById(id)).expectNotFound();
    (await templates.update(id, update)).expectNotFound();
    (await templates.remove(id)).expectNotFound();
  });

  test('GET /Templates/search with no match returns an empty list', async ({ templates }) => {
    expect((await templates.search({ doctorId, templateType: 'treatment', searchTerm: 'zzqxwvnomatch' })).expectStatus(200)).toEqual([]);
  });

  test('GET /Templates for an unknown doctor is empty', async ({ templates }) => {
    expect((await templates.getAll({ doctorId: crypto.randomUUID() })).expectStatus(200)).toEqual([]);
  });

  test('write requests without a token return 401', async ({ anon }) => {
    const api = anon(TemplatesApi);
    (await api.create(templatePayload(doctorId!))).expectUnauthorized();
    (await api.update(crypto.randomUUID(), {})).expectUnauthorized();
    (await api.remove(crypto.randomUUID())).expectUnauthorized();
  });
});
