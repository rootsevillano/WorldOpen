/** ADR-0006: solo `admin` ("Dios") puede mutar el mundo; `observer` solo mira. */
export type Role = 'admin' | 'observer';

export interface Issuer {
  userId: string;
  role: Role;
}
