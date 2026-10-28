import { ApiClient } from './ApiClient';

export type PaperSize = 'a4' | 'thermal80';

/**
 * Swagger tag: PrescriptionSettings (print layout: header, footer, signature).
 * Settings resolve chamber -> doctor -> default; the response "source" says which level was used.
 */
export class PrescriptionSettingsApi extends ApiClient {
  getSettings(doctorId?: string, chamberId?: string) {
    return this.get('/prescription-settings', { query: { doctorId, chamberId } });
  }
  getAllByDoctorId(doctorId?: string) {
    return this.get('/prescription-settings/get-all-by-doctorId', { query: { doctorId } });
  }
  /**
   * Create or replace (upsert) the settings for doctor (+ chamber).
   * Chamber-level saves are deleted after the test. Doctor-level saves are refused: deleting them
   * would wipe the doctor's real print settings.
   */
  save(data: { doctorId?: string; chamberId?: string; settings: unknown }) {
    if (data.doctorId && !data.chamberId) {
      throw new Error('Tests must save prescription settings for a test chamber (chamberId), never at doctor level');
    }
    return this.put('/prescription-settings', {
      data,
      cleanup: () => (data.doctorId && data.chamberId
        ? { template: '/prescription-settings', query: { doctorId: data.doctorId, chamberId: data.chamberId } }
        : undefined),
    });
  }
  remove(doctorId?: string, chamberId?: string) {
    return this.delete('/prescription-settings', { query: { doctorId, chamberId } });
  }
  /** Renders a PDF from unsaved settings. */
  preview(data: { settings: unknown; paper: PaperSize | string; doctorId?: string }) {
    return this.post('/prescription-settings/preview', { data, headers: { Accept: 'application/pdf, application/json;q=0.9' } });
  }
}
