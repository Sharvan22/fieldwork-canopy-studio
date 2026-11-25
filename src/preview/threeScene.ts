import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  canopyProduct,
  activeSurfaces,
  panelFor,
  sides,
  type Configuration,
  type Side,
  type Surface,
} from '../../shared/config'
import { panelCanvas } from '../art/painter'
import { canvasSnapshot, type PreviewEngine } from './types'

function wallGeometry(surface: Surface) {
  const full = surface.kind === 'wall',
    radius = full ? 1.465 : 1.515
  const top = full ? 1.9 : 0.94,
    bottom = full ? 0.025 : 0.044
  const direction = (sides.indexOf(surface.side) * Math.PI) / 2
  const face = new THREE.PlaneGeometry(3.048, top - bottom)
  // PlaneGeometry uses bottom-origin UVs; the model and editor use top-origin UVs.
  const uv = face.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - uv.getY(i))
  if (surface.inside) face.rotateY(Math.PI)
  face.translate(0, (top + bottom) / 2, radius - (surface.inside ? 0.003 : 0))
  face.rotateY(direction)
  return face
}
function softShadow() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(42,49,37,.25)')
  g.addColorStop(0.5, 'rgba(42,49,37,.13)')
  g.addColorStop(1, 'rgba(42,49,37,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const map = new THREE.CanvasTexture(c)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 4.9),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.002
  return floor
}
export async function makeThreeScene(
  host: HTMLDivElement,
  pick: (id: string) => void,
  lost: () => void,
): Promise<PreviewEngine> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  try {
    const asset = await new GLTFLoader().loadAsync(canopyProduct.modelUrl)
    const scene = new THREE.Scene()
    const model = asset.scene
    scene.add(model)
    const camera = new THREE.OrthographicCamera(-3, 3, 2.3, -2.3, 0.1, 60)
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = false
    controls.minZoom = 0.68
    controls.maxZoom = 2.45
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI * 0.485
    controls.rotateSpeed = 0.85
    controls.zoomSpeed = 0.82
    let disposed = false,
      materialsReady = false,
      pendingFrame = 0
    const render = () => {
      if (!materialsReady || disposed || pendingFrame) return
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0
        if (!disposed) renderer.render(scene, camera)
      })
    }
    const hemi = new THREE.HemisphereLight(0xfffcf2, 0xbfc6b0, 1.68)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff7df, 2.2)
    key.position.set(-3, 9, 3.5)
    key.castShadow = true
    key.shadow.mapSize.set(512, 512)
    key.shadow.radius = 4
    Object.assign(key.shadow.camera, { left: -3.8, right: 3.8, top: 4, bottom: -4, far: 20 })
    key.shadow.normalBias = 0.018
    key.shadow.bias = -0.0004
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xe4edf2, 0.5)
    fill.position.set(4, 3, -4)
    scene.add(fill)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ color: 0x4a4e42, opacity: 0.085, depthWrite: false }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.008
    ground.receiveShadow = true
    scene.add(ground, softShadow())
    const lightBars = new THREE.Group()
    const barMaterial = new THREE.MeshBasicMaterial({ color: 0xffe3a0 })
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BoxGeometry(2.82, 0.025, 0.025)
      geo.translate(0, 1.925, 1.47)
      geo.rotateY((i * Math.PI) / 2)
      lightBars.add(new THREE.Mesh(geo, barMaterial))
    }
    scene.add(lightBars)
    lightBars.visible = false
    const meshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>()
    const originalMats = new Set<THREE.Material>()
    const frame: THREE.Object3D[] = []
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.castShadow = true
      if (o.name.startsWith('frame-')) frame.push(o)
      if (!/^(roof|valance)-/.test(o.name)) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) originalMats.add(m)
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.93,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      o.material = mat
      meshes.set(o.name, o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>)
    })
    const maps = new Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }>()
    let revision = 0,
      activeSide: Side = 'front',
      shadowOptions = ''
    const unprinted = new Map<string, THREE.Mesh>()
    const reverseCloth = new THREE.MeshStandardMaterial({
      color: 0xe8e6dc,
      side: THREE.BackSide,
      roughness: 1,
    })
    const resize = () => {
      const w = Math.max(2, host.clientWidth),
        h = Math.max(2, host.clientHeight),
        aspect = w / h
      const span = Math.max(4.26, 4.95 / aspect)
      camera.left = (-span * aspect) / 2
      camera.right = -camera.left
      camera.top = span / 2
      camera.bottom = -camera.top
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
      render()
    }
    const orient = (side: Side) => {
      activeSide = side
      const angle = (sides.indexOf(side) * Math.PI) / 2 + 0.48
      controls.target.set(0, 1.47, 0)
      camera.position.set(Math.sin(angle) * 8, 3.59, Math.cos(angle) * 8)
      controls.update()
      render()
    }
    const reset = () => {
      camera.zoom = 1
      camera.updateProjectionMatrix()
      orient(activeSide)
    }
    const observer = new ResizeObserver(resize)
    controls.addEventListener('change', render)
    let downX = 0,
      downY = 0
    const down = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
      const r = canvas.getBoundingClientRect()
      if (!r.width || !r.height) return
      const ray = new THREE.Raycaster()
      ray.setFromCamera(
        new THREE.Vector2(
          (2 * (e.clientX - r.left)) / r.width - 1,
          1 - (2 * (e.clientY - r.top)) / r.height,
        ),
        camera,
      )
      const hit = ray.intersectObjects([...meshes.values()], false)[0]
      if (hit) pick(hit.object.name)
    }
    const contextLost = (event: Event) => {
      event.preventDefault()
      if (!disposed) lost()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('webglcontextlost', contextLost)
    host.append(canvas)
    observe()
    function observe() {
      observer.observe(host)
      resize()
      reset()
    }
    return {
      async update(config: Configuration) {
        const sequence = ++revision,
          active = activeSurfaces(config.options)
        const painted = await Promise.all(active.map((s) => panelCanvas(s, panelFor(config, s.id))))
        if (disposed || revision !== sequence) return
        const ids = new Set(active.map((s) => s.id))
        for (const [id, m] of meshes)
          if (!ids.has(id)) {
            model.remove(m)
            m.geometry.dispose()
            m.material.dispose()
            meshes.delete(id)
            maps.get(id)?.texture.dispose()
            maps.delete(id)
          }
        frame.forEach((f) => {
          f.visible = config.options.frame !== 'fabric'
        })
        lightBars.visible = config.options.frame === 'light'
        const doubleFaces = new Set(
          active.filter((s) => s.inside).map((s) => s.id.replace('-inside', '')),
        )
        active.forEach((s, i) => {
          let m = meshes.get(s.id)
          if (!m && (s.kind === 'half' || s.kind === 'wall')) {
            m = new THREE.Mesh(
              wallGeometry(s),
              new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0 }),
            )
            m.name = s.id
            m.castShadow = true
            model.add(m)
            meshes.set(s.id, m)
          }
          if (!m) return
          if (s.kind === 'wall' || s.kind === 'half') {
            m.material.side = THREE.FrontSide
            if (!s.inside && !doubleFaces.has(s.id) && !unprinted.has(s.id)) {
              const reverse = new THREE.Mesh(wallGeometry(s), reverseCloth)
              model.add(reverse)
              unprinted.set(s.id, reverse)
            }
          }
          if (maps.get(s.id)?.canvas === painted[i]) return
          const previous = maps.get(s.id)?.texture
          const tex = new THREE.CanvasTexture(painted[i])
          tex.colorSpace = THREE.SRGBColorSpace
          tex.flipY = false
          tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
          m.material.map = tex
          m.material.needsUpdate = true
          maps.set(s.id, { canvas: painted[i], texture: tex })
          previous?.dispose()
        })
        for (const [id, reverse] of unprinted)
          if (!ids.has(id) || doubleFaces.has(id)) {
            model.remove(reverse)
            reverse.geometry.dispose()
            unprinted.delete(id)
          }
        const options = JSON.stringify(config.options)
        if (options !== shadowOptions) {
          renderer.shadowMap.needsUpdate = true
          shadowOptions = options
        }
        materialsReady = true
        render()
      },
      side: orient,
      fit: reset,
      zoom(factor) {
        camera.zoom = THREE.MathUtils.clamp(
          camera.zoom * factor,
          controls.minZoom,
          controls.maxZoom,
        )
        camera.updateProjectionMatrix()
        render()
      },
      snapshot() {
        const proofCamera = camera.clone()
        proofCamera.zoom = 1
        proofCamera.position.set(Math.sin(0.48) * 8, 3.59, Math.cos(0.48) * 8)
        proofCamera.lookAt(0, 1.47, 0)
        proofCamera.updateProjectionMatrix()
        renderer.render(scene, proofCamera)
        const jpeg = canvasSnapshot(canvas)
        render()
        return jpeg
      },
      dispose() {
        disposed = true
        cancelAnimationFrame(pendingFrame)
        observer.disconnect()
        controls.removeEventListener('change', render)
        controls.dispose()
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('pointerup', up)
        canvas.removeEventListener('webglcontextlost', contextLost)
        for (const item of maps.values()) item.texture.dispose()
        const materials = new Set(originalMats)
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose()
            for (const mat of Array.isArray(o.material) ? o.material : [o.material])
              materials.add(mat)
          }
        })
        for (const mat of materials) {
          if (mat instanceof THREE.MeshBasicMaterial) mat.map?.dispose()
          mat.dispose()
        }
        reverseCloth.dispose()
        key.shadow.map?.dispose()
        renderer.dispose()
        canvas.remove()
      },
    }
  } catch (error) {
    renderer.dispose()
    canvas.remove()
    throw error
  }
}
