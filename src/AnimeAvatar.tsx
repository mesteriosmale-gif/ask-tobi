'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'

const AVATAR_FRAME_SIZE = 2.2

type AnimeAvatarProps = {
  isLoading: boolean
  reactionTick: number
}

type AvatarRig = {
  scene: THREE.Object3D
}

function AvatarModel({ isLoading, reactionTick }: AnimeAvatarProps) {
  const gltf = useLoader(GLTFLoader, '/models/elaina.glb', (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder)
  })
  const avatarRef = useRef<THREE.Group>(null)
  const pointer = useRef(new THREE.Vector2())
  const reaction = useRef({ kind: -1, startedAt: 0 })
  const headRef = useRef<THREE.Object3D | null>(null)
  const leftEyeRef = useRef<THREE.Object3D | null>(null)
  const rightEyeRef = useRef<THREE.Object3D | null>(null)
  const headBaseRef = useRef<THREE.Euler | null>(null)
  const leftEyeBaseRef = useRef<THREE.Euler | null>(null)
  const rightEyeBaseRef = useRef<THREE.Euler | null>(null)

  const rig = useMemo<AvatarRig>(() => {
    const scene = cloneSkinnedScene(gltf.scene)
    const character = scene.getObjectByName('char_grp') ?? scene
    let branch = character
    while (branch !== scene && branch.parent) {
      const parent = branch.parent
      for (const sibling of [...parent.children]) {
        if (sibling !== branch) parent.remove(sibling)
      }
      branch = parent
    }
    scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(character)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = AVATAR_FRAME_SIZE / Math.max(size.x, size.y, size.z, 0.001)

    scene.scale.setScalar(scale)
    scene.position.set(-center.x * scale, 0.16 - center.y * scale, -center.z * scale)

    return { scene }
  }, [gltf.scene])

  useEffect(() => {
    const head = rig.scene.getObjectByName('head.x_0158') ?? null
    const leftEye = rig.scene.getObjectByName('c_eye.l_0231') ?? null
    const rightEye = rig.scene.getObjectByName('c_eye.r_0251') ?? null
    headRef.current = head
    leftEyeRef.current = leftEye
    rightEyeRef.current = rightEye
    headBaseRef.current = head?.rotation.clone() ?? null
    leftEyeBaseRef.current = leftEye?.rotation.clone() ?? null
    rightEyeBaseRef.current = rightEye?.rotation.clone() ?? null
  }, [rig])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      if (typeof window !== 'undefined') {
        pointer.current.set(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
        )
      }
    }
    window.addEventListener('pointermove', trackPointer, { passive: true })
    return () => window.removeEventListener('pointermove', trackPointer)
  }, [])

  useEffect(() => {
    if (reactionTick === 0) return
    reaction.current = {
      kind: Math.floor(Math.random() * 4),
      startedAt: performance.now() * 0.001,
    }
  }, [reactionTick])

  useFrame((state, delta) => {
    const avatar = avatarRef.current
    if (!avatar) return

    const time = state.clock.elapsedTime
    const lookX = THREE.MathUtils.clamp(pointer.current.x, -1, 1)
    const lookY = THREE.MathUtils.clamp(pointer.current.y, -1, 1)
    const motion = reaction.current
    const progress = motion.kind < 0 ? 1 : THREE.MathUtils.clamp((performance.now() * 0.001 - motion.startedAt) / 0.8, 0, 1)
    const envelope = motion.kind < 0 ? 0 : Math.sin(progress * Math.PI)
    const bounce = motion.kind === 0 ? envelope * 0.16 : 0
    const tilt = motion.kind === 1 ? envelope * 0.2 : 0
    const nod = motion.kind === 2 ? envelope * 0.16 : 0
    const pulse = motion.kind === 3 ? envelope * 0.07 : 0
    const ease = 1 - Math.exp(-delta * 9)

    avatar.position.y += ((isLoading ? 0.12 : 0) + Math.sin(time * 1.25) * 0.018 + bounce - avatar.position.y) * ease
    avatar.rotation.y += (lookX * 0.13 + Math.sin(time * 0.42) * 0.025 - avatar.rotation.y) * ease
    avatar.rotation.z += (lookX * -0.035 + tilt - avatar.rotation.z) * ease
    const scale = 1 + pulse
    avatar.scale.setScalar(THREE.MathUtils.damp(avatar.scale.x, scale, 9, delta))

    const head = headRef.current
    const headBase = headBaseRef.current
    if (head && headBase) {
      head.rotation.y = headBase.y + lookX * 0.24
      head.rotation.x = headBase.x - lookY * 0.17 + nod
      head.rotation.z = headBase.z + tilt * 0.45 - lookX * 0.045
    }
    const leftEye = leftEyeRef.current
    const leftEyeBase = leftEyeBaseRef.current
    if (leftEye && leftEyeBase) {
      leftEye.rotation.y = leftEyeBase.y + lookX * 0.11
      leftEye.rotation.x = leftEyeBase.x - lookY * 0.09
    }
    const rightEye = rightEyeRef.current
    const rightEyeBase = rightEyeBaseRef.current
    if (rightEye && rightEyeBase) {
      rightEye.rotation.y = rightEyeBase.y + lookX * 0.11
      rightEye.rotation.x = rightEyeBase.x - lookY * 0.09
    }
  })

  return (
    <group ref={avatarRef}>
      <primitive object={rig.scene} dispose={null} />
    </group>
  )
}

export default function AnimeAvatar(props: AnimeAvatarProps) {
  return (
    <div className="assistant-avatar" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 2.4], fov: 38, near: 0.01, far: 20 }}
        dpr={1}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={1.8} />
        <directionalLight position={[1.5, 2, 3]} intensity={2.1} />
        <Suspense fallback={null}>
          <AvatarModel {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}