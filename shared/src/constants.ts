// Numbers shared by client and server. Tune movement feel here, nowhere else.

/** Fixed simulation step (seconds). */
export const STEP = 1 / 60;
/** Network tick rate (Hz). Client sends input every STEP_HZ / NET_HZ steps. */
export const NET_HZ = 15;
