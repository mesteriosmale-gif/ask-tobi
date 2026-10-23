import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { SculptureVisualState } from './chatTypes'

type SculptureProps = {
  dark: boolean
  visualState: SculptureVisualState
}

const vertexShader = `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPointerActive;
  uniform float uEnergy;
  uniform float uWaveSpeed;
  uniform float uWaveFrequency;
  uniform float uTurbulence;
  uniform float uParticleSize;
  uniform vec3 uInteractionColor;
  uniform vec2 uInteractionPointer;
  uniform float uInteractionTime;
  uniform float uInteractionMode;
  uniform float uInteractionPower;
  attribute float aSeed;
  varying float vShade;
  varying float vAlpha;
  varying float vPulse;

  void main() {
    vec3 p = position;
    float waves = uWaveSpeed * (0.7 + uEnergy * 0.75);
    float frequency = uWaveFrequency;
    float wave = sin(p.x * frequency + uTime * waves + aSeed * 6.28318)
      * cos(p.y * frequency * 0.78 - uTime * waves * 0.72 + aSeed * 3.1);
    float distortion = 0.035 + uEnergy * 0.045 + uTurbulence * 0.075;
    p += normal * wave * distortion;
    p.z += sin(p.x * frequency * 0.62 + p.y * frequency * 0.48 + uTime * waves * 0.55 + aSeed * 8.0) * (0.025 + uTurbulence * 0.07);

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vec4 clipPosition = projectionMatrix * viewPosition;
    vec2 screenPosition = clipPosition.xy / clipPosition.w;
    vec2 delta = screenPosition - uPointer;
    float distanceToPointer = length(delta);
    float influence = exp(-distanceToPointer * 2.7) * uPointerActive;
    float liquidWave = sin(distanceToPointer * 25.0 - uTime * waves * 2.0 + aSeed * 4.0);
    p.xy += normalize(delta + vec2(0.0001)) * liquidWave * influence * (0.035 + uEnergy * 0.045 + uTurbulence * 0.045);
    p.z += liquidWave * influence * (0.07 + uTurbulence * 0.08);

    float interactionAge = max(uTime - uInteractionTime, 0.0);
    float interactionDecay = exp(-interactionAge * 1.65) * uInteractionPower;
    vec2 interactionDelta = screenPosition - uInteractionPointer;
    float interactionDistance = length(interactionDelta);
    vec2 interactionDirection = normalize(interactionDelta + vec2(0.0001));
    float interactionFalloff = exp(-interactionDistance * 5.4);
    float interactionWave = sin(interactionDistance * 34.0 - interactionAge * 13.0 + aSeed * 5.0);
    vec2 interactionMotion = interactionDirection * interactionWave;

    if (uInteractionMode >= 0.5 && uInteractionMode < 1.5) {
      interactionMotion = vec2(-interactionDirection.y, interactionDirection.x) * interactionWave;
    } else if (uInteractionMode >= 1.5 && uInteractionMode < 2.5) {
      float expandingRing = exp(-abs(interactionDistance - interactionAge * 0.48) * 15.0);
      interactionMotion = interactionDirection * (interactionWave + expandingRing * 2.0);
    } else if (uInteractionMode >= 2.5 && uInteractionMode < 3.5) {
      interactionMotion = -interactionDirection * interactionWave;
    } else if (uInteractionMode >= 3.5) {
      interactionMotion = vec2(
        sin(interactionAge * 17.0 + aSeed * 12.0 + interactionDistance * 28.0),
        cos(interactionAge * 15.0 + aSeed * 9.0 - interactionDistance * 25.0)
      );
    }

    float interactionLight = interactionFalloff * interactionDecay;
    p.xy += interactionMotion * interactionLight * 0.095;
    p.z += interactionWave * interactionLight * 0.16;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp((uParticleSize * (0.78 + aSeed * 0.42)) * (4.0 / -viewPosition.z), 1.0, 10.0);
    vShade = clamp(aSeed * 0.58 + (p.y + 1.8) * 0.12 + max(influence, interactionLight) * 0.3, 0.0, 1.0);
    vAlpha = 0.82 + aSeed * 0.18;
    vPulse = max(influence, interactionLight);
  }
`

const fragmentShader = `
  uniform float uDark;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uInteractionColor;
  varying float vShade;
  varying float vAlpha;
  varying float vPulse;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float circle = 1.0 - smoothstep(0.18, 0.5, length(point));
    vec3 color = mix(uPrimaryColor, uSecondaryColor, smoothstep(0.08, 0.82, vShade));
    color = mix(color, uHighlightColor, smoothstep(0.72, 1.0, vShade) * 0.82 + vPulse * 0.28);
    color = mix(color, uInteractionColor, clamp(vPulse * 0.95, 0.0, 0.9));
    color += uInteractionColor * vPulse * 0.85;
    color = mix(color * 0.72, color, uDark);
    color *= 1.42 + vPulse * 1.4;
    gl_FragColor = vec4(color, circle * vAlpha * (1.0 + vPulse * 0.65));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function getDeviceProfile() {
  const narrowScreen = window.matchMedia('(max-width: 700px)').matches
  const cores = navigator.hardwareConcurrency || 4
  const lowPower = narrowScreen || cores <= 4
  const highPower = !lowPower && cores >= 8 && window.innerWidth >= 1440

  return {
    particleCount: lowPower ? 38_000 : highPower ? 95_000 : 65_000,
    pixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1 : highPower ? 1.35 : 1.15),
    targetFps: lowPower ? 30 : highPower ? 60 : 45,
    antialias: highPower,
  }
}

function createSculpture(particleCount: number) {
  const positions = new Float32Array(particleCount * 3)
  const normals = new Float32Array(particleCount * 3)
  const seeds = new Float32Array(particleCount)
  const strands = 250
  const pointsPerStrand = particleCount / strands

  for (let strand = 0; strand < strands; strand += 1) {
    const phase = (strand / strands) * Math.PI * 2
    const strandSeed = Math.random()

    for (let point = 0; point < pointsPerStrand; point += 1) {
      const index = strand * pointsPerStrand + point
      const u = (point / pointsPerStrand) * Math.PI * 2
      const v = phase + Math.sin(u * 2 + phase) * 0.18
      const ring = 1.02 + 0.13 * Math.sin(u * 3 + phase * 1.5)
        + Math.sin(u * 2 + strandSeed * 9) * 0.09
      const tube = 0.3 + (strandSeed - 0.5) * 0.14
      const wobble = (Math.random() - 0.5) * 0.045
      const index3 = index * 3

      positions[index3] = (ring + (tube + wobble) * Math.cos(v)) * Math.cos(u) * 1.12
      positions[index3 + 1] = (ring + (tube + wobble) * Math.cos(v)) * Math.sin(u) * 0.66
      positions[index3 + 2] = (tube + wobble) * Math.sin(v) + Math.sin(u * 2 + phase) * 0.16
      normals[index3] = Math.cos(v) * Math.cos(u)
      normals[index3 + 1] = Math.cos(v) * Math.sin(u)
      normals[index3 + 2] = Math.sin(v)
      seeds[index] = strandSeed
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  return geometry
}

const usedInteractionColors = new Set<number>()

function createUniqueNeonColor(): THREE.Color {
  let color: THREE.Color
  let hex: number
  do {
    color = new THREE.Color().setHSL(
      Math.random(),
      0.96,
      0.58,
      THREE.SRGBColorSpace,
    )
    hex = color.getHex(THREE.SRGBColorSpace)
  } while (usedInteractionColors.has(hex))

  usedInteractionColors.add(hex)
  return color
}

export default function Sculpture({ dark, visualState }: SculptureProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const darkRef = useRef(dark)
  const visualStateRef = useRef(visualState)

  useEffect(() => {
    darkRef.current = dark
  }, [dark])

  useEffect(() => {
    visualStateRef.current = visualState
  }, [visualState])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const profile = getDeviceProfile()
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100)
    camera.position.set(0, 0, 6.4)

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: profile.antialias,
      powerPreference: profile.particleCount <= 38_000 ? 'low-power' : 'default',
    })
    renderer.setPixelRatio(profile.pixelRatio)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const geometry = createSculpture(profile.particleCount)
    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerActive: { value: 1 },
      uEnergy: { value: visualStateRef.current.energy },
      uWaveSpeed: { value: visualStateRef.current.waveSpeed },
      uWaveFrequency: { value: visualStateRef.current.waveFrequency },
      uTurbulence: { value: visualStateRef.current.turbulence },
      uParticleSize: { value: visualStateRef.current.particleSize },
      uInteractionColor: { value: createUniqueNeonColor() },
      uInteractionPointer: { value: new THREE.Vector2(0, 0) },
      uInteractionTime: { value: -100 },
      uInteractionMode: { value: 0 },
      uInteractionPower: { value: 0 },
      uSpin: { value: visualStateRef.current.spin },
      uPrimaryColor: { value: new THREE.Color(visualStateRef.current.primaryColor) },
      uSecondaryColor: { value: new THREE.Color(visualStateRef.current.secondaryColor) },
      uHighlightColor: { value: new THREE.Color(visualStateRef.current.highlightColor) },
      uDark: { value: darkRef.current ? 1 : 0 },
    }
    const colorTargets = {
      primary: new THREE.Color(visualStateRef.current.primaryColor),
      secondary: new THREE.Color(visualStateRef.current.secondaryColor),
      highlight: new THREE.Color(visualStateRef.current.highlightColor),
      interaction: uniforms.uInteractionColor.value.clone(),
    }
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sculpture = new THREE.Points(geometry, material)
    sculpture.rotation.set(0.16, -0.2, -0.13)
    scene.add(sculpture)

    const pointer = new THREE.Vector2(0, 0)
    let isInView = true
    let isDocumentVisible = document.visibilityState === 'visible'
    let previousInteractionMode = -1
    const handlePointerMove = (event: PointerEvent) => {
      pointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      )
      uniforms.uPointerActive.value = 1
    }
    const triggerInteraction = (x: number, y: number) => {
      let mode = Math.floor(Math.random() * 5)
      if (mode === previousInteractionMode) mode = (mode + 1 + Math.floor(Math.random() * 4)) % 5
      previousInteractionMode = mode
      colorTargets.interaction.copy(createUniqueNeonColor())
      uniforms.uInteractionPointer.value.set(x, y)
      uniforms.uInteractionTime.value = uniforms.uTime.value
      uniforms.uInteractionMode.value = mode
      uniforms.uInteractionPower.value = 0.85 + Math.random() * 0.65
      uniforms.uPointer.value.set(x, y)
      uniforms.uPointerActive.value = 1
    }
    const handlePointerDown = (event: PointerEvent) => {
      triggerInteraction(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      )
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      triggerInteraction(pointer.x, pointer.y)
    }
    uniforms.uPointerActive.value = 1
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState === 'visible'
      if (isDocumentVisible && isInView && frame === 0) {
        frame = window.requestAnimationFrame(render)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isInView = entry.isIntersecting
      if (isInView && isDocumentVisible && frame === 0) {
        frame = window.requestAnimationFrame(render)
      } else if (!isInView && frame !== 0) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    })
    intersectionObserver.observe(host)

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.position.z = width < 560 ? 7.3 : 6.4
      const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const visibleWidth = 2 * tanHalfFov * camera.position.z * camera.aspect
      const visibleHeight = 2 * tanHalfFov * camera.position.z
      const sculptureSize = Math.max(visibleWidth, visibleHeight) * 0.78
      sculpture.scale.set(sculptureSize / 3.3, sculptureSize / 2.8, sculptureSize / 3.3)
      sculpture.position.set(visibleWidth * 0.22, visibleHeight * 0.06, 0)
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(host)

    const start = performance.now()
    let frame = 0
    let lastRender = 0
    const frameInterval = 1_000 / profile.targetFps
    const render = (now: number) => {
      frame = 0
      if (!isDocumentVisible || !isInView) return
      if (now - lastRender < frameInterval) {
        frame = window.requestAnimationFrame(render)
        return
      }

      const elapsed = (now - start) * 0.001
      const delta = lastRender === 0 ? 1 / profile.targetFps : Math.min((now - lastRender) * 0.001, 0.1)
      lastRender = now
      const smooth = 1 - Math.exp(-delta * 2.4)
      const currentState = visualStateRef.current
      uniforms.uTime.value = elapsed
      uniforms.uPointer.value.copy(pointer)
      uniforms.uEnergy.value += (currentState.energy - uniforms.uEnergy.value) * smooth
      uniforms.uWaveSpeed.value += (currentState.waveSpeed - uniforms.uWaveSpeed.value) * smooth
      uniforms.uWaveFrequency.value += (currentState.waveFrequency - uniforms.uWaveFrequency.value) * smooth
      uniforms.uTurbulence.value += (currentState.turbulence - uniforms.uTurbulence.value) * smooth
      uniforms.uParticleSize.value += (currentState.particleSize - uniforms.uParticleSize.value) * smooth
      uniforms.uSpin.value += (currentState.spin - uniforms.uSpin.value) * smooth
      colorTargets.primary.set(currentState.primaryColor)
      colorTargets.secondary.set(currentState.secondaryColor)
      colorTargets.highlight.set(currentState.highlightColor)
      uniforms.uPrimaryColor.value.lerp(colorTargets.primary, 1 - Math.exp(-delta * 2.13))
      uniforms.uSecondaryColor.value.lerp(colorTargets.secondary, 1 - Math.exp(-delta * 2.13))
      uniforms.uHighlightColor.value.lerp(colorTargets.highlight, 1 - Math.exp(-delta * 2.13))
      uniforms.uInteractionColor.value.lerp(colorTargets.interaction, 1 - Math.exp(-delta * 9))
      uniforms.uDark.value += ((darkRef.current ? 1 : 0) - uniforms.uDark.value) * (1 - Math.exp(-delta * 3.6))
      const targetRotationX = 0.16 - pointer.y * 0.12
      const targetRotationY = -0.2 + Math.sin(elapsed * 0.14) * 0.035 + pointer.x * 0.16 + uniforms.uSpin.value * elapsed * 0.025
      const targetRotationZ = -0.13 + Math.sin(elapsed * 0.11) * 0.02 - pointer.x * 0.045
      sculpture.rotation.x += (targetRotationX - sculpture.rotation.x) * smooth
      sculpture.rotation.y += (targetRotationY - sculpture.rotation.y) * smooth
      sculpture.rotation.z += (targetRotationZ - sculpture.rotation.z) * smooth
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }
    frame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="sculpture-canvas" ref={hostRef} />
}
