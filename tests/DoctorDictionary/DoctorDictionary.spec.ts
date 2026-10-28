import { test, expect } from '@fixtures';
import { DoctorDictionaryApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorDictionary (a doctor's text shortcuts)

test.describe('Doctor dictionary', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorDictionary lists the doctor shortcuts @smoke', async ({ doctorDictionary }) => {
    (await doctorDictionary.list(doctorId!)).expectStatus(200);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, list, update and delete a shortcut', async ({ doctorDictionary }) => {
      const body = doctorRef.dictionary(doctorId!);

      const id = await test.step('POST /DoctorDictionary creates a shortcut', async () =>
        extractId((await doctorDictionary.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorDictionary/{id} returns it', async () => {
        expect((await doctorDictionary.getById(id)).expectStatus(200)).toMatchObject({ text: body.text, shortcut: body.shortcut });
      });

      await test.step('created shortcut appears in the doctor list', async () => {
        expect(JSON.stringify((await doctorDictionary.list(doctorId!)).expectStatus(200))).toContain(id);
      });

      await test.step('PUT /DoctorDictionary/{id} updates it', async () => {
        const changes = { text: `${body.text} (updated)`, shortcut: body.shortcut };
        (await doctorDictionary.update(id, changes)).expectStatus(200);
        expect((await doctorDictionary.getById(id)).expectStatus(200).text).toBe(changes.text);
      });

      await test.step('DELETE /DoctorDictionary/{id} removes it', async () => {
        (await doctorDictionary.remove(id)).expectStatus([200, 204]);
      });
    });
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorDictionaryApi).getById(crypto.randomUUID())).expectUnauthorized();
});

test.describe('Doctor dictionary - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorDictionary }) => {
    const id = crypto.randomUUID();
    (await doctorDictionary.getById(id)).expectNotFound();
    (await doctorDictionary.update(id, { text: '[AUTO] x', shortcut: 'x' })).expectNotFound();
    (await doctorDictionary.remove(id)).expectNotFound();
  });

  test('POST with a shortcut the doctor already uses returns 400 UNIQUE_VIOLATION', async ({ doctorDictionary }) => {
    const first = doctorRef.dictionary(doctorId!);
    (await doctorDictionary.create(first)).expectStatus([200, 201]);
    const dup = await doctorDictionary.create({ ...first, text: `${first.text} (duplicate)` });
    dup.expectStatus(400);
    expect(dup.error?.code).toBe('UNIQUE_VIOLATION');
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorDictionaryApi).create(doctorRef.dictionary(doctorId!))).expectUnauthorized();
  });
});
