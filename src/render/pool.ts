import * as THREE from 'three';

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

/**
 * An InstancedMesh that is refilled every frame: begin(), add() per instance, end().
 * Grows (x2) when it runs out of instances.
 */
export class InstancedPool {
  mesh: THREE.InstancedMesh;
  private count = 0;

  constructor(
    private scene: THREE.Object3D,
    private geometry: THREE.BufferGeometry,
    private material: THREE.Material,
    private capacity = 512,
    private shadows = true,
  ) {
    this.mesh = this.create(capacity);
  }

  private create(capacity: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    // white by default: three zero-fills instanceColor, which would render untinted instances black
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    m.castShadow = this.shadows;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.count = 0;
    this.scene.add(m);
    return m;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, rotY = 0, scale = 1, color?: number, rotX = 0, rotZ = 0): void {
    if (this.count >= this.capacity) {
      const old = this.mesh;
      this.capacity *= 2;
      this.mesh = this.create(this.capacity);
      for (let i = 0; i < this.count; i++) {
        old.getMatrixAt(i, tmp.matrix);
        this.mesh.setMatrixAt(i, tmp.matrix);
        old.getColorAt(i, tmpColor);
        this.mesh.setColorAt(i, tmpColor);
      }
      this.scene.remove(old);
      old.dispose();
    }
    tmp.position.set(x, y, z);
    tmp.rotation.set(rotX, rotY, rotZ);
    tmp.scale.setScalar(scale);
    tmp.updateMatrix();
    this.mesh.setMatrixAt(this.count, tmp.matrix);
    this.mesh.setColorAt(this.count, tmpColor.setHex(color ?? 0xffffff));
    this.count++;
  }

  /** A unit-length (along +z) instance stretched to `length`, starting at `from`. */
  addBeam(from: THREE.Vector3, yaw: number, pitch: number, length: number): void {
    this.add(from.x, from.y, from.z, yaw, 1, undefined, pitch);
    tmp.position.copy(from);
    tmp.rotation.set(pitch, yaw, 0, 'YXZ');
    tmp.scale.set(1, 1, length);
    tmp.updateMatrix();
    this.mesh.setMatrixAt(this.count - 1, tmp.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

/** Emissive material whose glow is scaled by the current theme (see setGlow). */
export function glowMat(color: number, intensity: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
  m.userData.baseGlow = intensity;
  return m;
}

export function setGlow(root: THREE.Object3D, factor: number, extra: THREE.Material[] = []): void {
  const apply = (m: THREE.Material) => {
    const sm = m as THREE.MeshStandardMaterial;
    if (sm.userData?.baseGlow !== undefined) sm.emissiveIntensity = sm.userData.baseGlow * factor;
  };
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(apply);
  });
  extra.forEach(apply);
}

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
