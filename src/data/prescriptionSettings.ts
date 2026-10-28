import { uid } from '@utils/data';

// Valid PrescriptionSettings body. Rules enforced by the API (not in Swagger):
// doctorName en + bn, >= 1 degree, >= 1 speciality, BMDC no. (en or bn),
// header height 0-400 pt, footer height 0-200 pt.
export const prescriptionSettings = () => ({
  header: {
    enabled: true,
    height: 100,
    doctorName: { en: `[AUTO] Dr Test ${uid()}`, bn: 'ডা. টেস্ট' },
    degrees: [{ en: 'MBBS', bn: 'এমবিবিএস' }, { en: 'FCPS (Medicine)', bn: 'এফসিপিএস (মেডিসিন)' }],
    specialities: [{ en: 'Medicine Specialist', bn: 'মেডিসিন বিশেষজ্ঞ' }],
    workplaces: [{ en: 'Dhaka Medical College Hospital', bn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল' }],
    bmdcRegistrationNo: { en: 'A00001', bn: 'A00001' },
    customLines: [{ label: { en: 'Phone', bn: 'ফোন' }, value: { en: '01700000000', bn: '০১৭০০০০০০০০' } }],
    tagline: 'Automated test settings',
  },
  footer: {
    enabled: true,
    height: 60,
    chamberName: '[AUTO] Test Chamber',
    chamberLocation: 'Dhanmondi, Dhaka',
    contact: '01700000000',
    visitingHours: ['Sat-Thu 5pm-9pm'],
    customLines: [{ label: 'Serial', value: '01800000000' }],
    instructions: ['Bring previous prescriptions'],
    qrCode: 'none',
  },
  signature: { enabled: true },
});

export type PrescriptionSettingsBody = ReturnType<typeof prescriptionSettings>;
