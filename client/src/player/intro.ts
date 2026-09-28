// Landing-screen camera: a slow dolly down the concourse, then an eased fly-in to the follow camera.
import { Vector3 } from 'three';

const FLY = 1.4; // seconds
const ease = (t: number) => 1 - (1 - t) ** 3;

export class Intro {
  /** 0 = orbiting, 1 = handed over to the follow camera. */
  t = 0;
  flying = false;
  readonly position = new Vector3();
  readonly target = new Vector3();
  private time = 0;
  private readonly fromPos = new Vector3();
  private readonly fromTarget = new Vector3();

  /**
   * @param start where the dolly begins (beside the concourse, clear of the escalators)
   * @param travel how far it drifts along −Z before easing back
   */
  constructor(
    private readonly start = new Vector3(4.3, 5.2, -3),
    private readonly travel = 16,
  ) {}

  /** Begin the fly-in from wherever the orbit currently is. */
  begin() {
    this.flying = true;
    this.fromPos.copy(this.position);
    this.fromTarget.copy(this.target);
  }

  get done() {
    return this.t >= 1;
  }

  update(dt: number, instant: boolean, follow: { position: Vector3; target: Vector3 }) {
    if (!this.flying) {
      // ping-pong along the concourse, slow enough to read the signs
      this.time += dt;
      const k = 0.5 - 0.5 * Math.cos(this.time * 0.12);
      this.position.set(this.start.x, this.start.y, this.start.z - k * this.travel);
      this.target.set(-2, 2.2, this.position.z - 18);
      return;
    }
    this.t = instant ? 1 : Math.min(1, this.t + dt / FLY);
    const e = ease(this.t);
    this.position.lerpVectors(this.fromPos, follow.position, e);
    this.target.lerpVectors(this.fromTarget, follow.target, e);
  }
}
