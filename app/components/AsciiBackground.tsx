"use client"

import { useEffect, useRef, useState } from "react"

const ASCII_CHARS = " .:-=+*#%@"

export default function AsciiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isClient, setIsClient] = useState(false)
  const animationRef = useRef<number>(0)
  const mouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return

    const canvas = canvasRef.current
    if (!canvas) return

    const asciiCols = 120
    const asciiRows = 60
    const glyphCount = ASCII_CHARS.length

    // Initialize particles
    const createGlyphAtlasCanvas = (cellSize: number) => {
      const atlas = document.createElement("canvas")
      atlas.width = cellSize * glyphCount
      atlas.height = cellSize

      const ctx = atlas.getContext("2d")
      if (!ctx) throw new Error("2D context unavailable")

      ctx.clearRect(0, 0, atlas.width, atlas.height)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, atlas.width, atlas.height)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `${Math.floor(cellSize * 0.9)}px monospace`

      for (let i = 0; i < glyphCount; i++) {
        const x = i * cellSize + cellSize * 0.5
        const y = cellSize * 0.52
        ctx.fillText(ASCII_CHARS[i], x, y)
      }

      return atlas
    }

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
    }
    window.addEventListener("mousemove", handleMouse)

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))

    const vertexSrc = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`.trim()

    const fragmentSrc = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_grid;
uniform sampler2D u_atlas;
uniform vec2 u_atlasGrid;
uniform float u_glyphCount;
uniform float u_opacity;

float field(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = sin(r * 10.0 - t) + cos(a * 4.0 + t * 0.7);
  v += 0.5 * sin(p.x * 3.0 + t * 0.9) * cos(p.y * 3.0 - t * 0.8);
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 cell = floor(uv * u_grid);
  vec2 cellUv = (cell + 0.5) / u_grid;
  vec2 local = fract(uv * u_grid);

  vec2 p = cellUv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;

  vec2 m = (u_mouse / max(u_resolution, vec2(1.0))) * 2.0 - 1.0;
  m.x *= u_resolution.x / u_resolution.y;
  p += 0.12 * m;

  float v = field(p, u_time);
  float b = clamp(0.5 + 0.25 * v, 0.0, 1.0);
  float idx = floor(b * (u_glyphCount - 1.0) + 0.5);
  
  float ax = (idx + local.x) / u_atlasGrid.x;
  float ay = local.y / u_atlasGrid.y;
  float a0 = texture2D(u_atlas, vec2(ax, ay)).r;
  a0 = step(0.5, a0);

  vec3 c1 = vec3(0.714, 0.941, 0.290);
  vec3 c2 = vec3(0.486, 0.361, 1.000);
  vec3 c3 = vec3(0.180, 0.949, 0.761);
  vec3 fg = mix(c1, c2, 0.35 + 0.35 * sin(u_time * 0.15 + p.x * 0.7));
  fg = mix(fg, c3, 0.25 + 0.25 * sin(u_time * 0.11 + p.y * 0.6));
  fg *= 0.35 + 0.85 * b;

  float alpha = a0 * u_opacity;
  gl_FragColor = vec4(fg * alpha, alpha);
}
`.trim()

    const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error("Failed to create shader")
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || ""
        gl.deleteShader(shader)
        throw new Error(info)
      }
      return shader
    }

    const tryStartWebGL = () => {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      }) as WebGLRenderingContext | null

      if (!gl) return null

      const vsh = compile(gl, gl.VERTEX_SHADER, vertexSrc)
      const fsh = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc)
      const prog = gl.createProgram()
      if (!prog) throw new Error("Failed to create program")
      gl.attachShader(prog, vsh)
      gl.attachShader(prog, fsh)
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(prog) || ""
        throw new Error(info)
      }

      gl.useProgram(prog)

      const posLoc = gl.getAttribLocation(prog, "a_pos")
      const buf = gl.createBuffer()
      if (!buf) throw new Error("Failed to create buffer")
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      )
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      const cellSize = 32
      const atlasCanvas = createGlyphAtlasCanvas(cellSize)
      const tex = gl.createTexture()
      if (!tex) throw new Error("Failed to create texture")
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas)

      const uResolution = gl.getUniformLocation(prog, "u_resolution")
      const uTime = gl.getUniformLocation(prog, "u_time")
      const uMouse = gl.getUniformLocation(prog, "u_mouse")
      const uGrid = gl.getUniformLocation(prog, "u_grid")
      const uAtlas = gl.getUniformLocation(prog, "u_atlas")
      const uAtlasGrid = gl.getUniformLocation(prog, "u_atlasGrid")
      const uGlyphCount = gl.getUniformLocation(prog, "u_glyphCount")
      const uOpacity = gl.getUniformLocation(prog, "u_opacity")

      if (uAtlas) gl.uniform1i(uAtlas, 0)
      if (uGrid) gl.uniform2f(uGrid, asciiCols, asciiRows)
      if (uAtlasGrid) gl.uniform2f(uAtlasGrid, glyphCount, 1)
      if (uGlyphCount) gl.uniform1f(uGlyphCount, glyphCount)
      if (uOpacity) gl.uniform1f(uOpacity, 0.65)

      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

      const resize = () => {
        const w = Math.floor(window.innerWidth * dpr)
        const h = Math.floor(window.innerHeight * dpr)
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
        if (uResolution) gl.uniform2f(uResolution, w, h)
      }
      resize()
      window.addEventListener("resize", resize)

      const startMs = performance.now()
      const render = () => {
        const t = (performance.now() - startMs) * 0.001
        if (uTime) gl.uniform1f(uTime, t)
        if (uMouse) gl.uniform2f(uMouse, mouseRef.current.x * dpr, (window.innerHeight - mouseRef.current.y) * dpr)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        animationRef.current = requestAnimationFrame(render)
      }

      return {
        render,
        destroy: () => {
          window.removeEventListener("resize", resize)
          cancelAnimationFrame(animationRef.current)
          gl.deleteTexture(tex)
          gl.deleteBuffer(buf)
          gl.deleteProgram(prog)
          gl.deleteShader(vsh)
          gl.deleteShader(fsh)
        },
      }
    }

    // Update position with subtle wave motion
    const start2D = () => {
      const ctx = canvas.getContext("2d", { alpha: true })
      if (!ctx) return null

      const glyphPx = 8
      const w = asciiCols * glyphPx
      const h = asciiRows * glyphPx

      canvas.width = w
      canvas.height = h
      canvas.style.width = "100%"
      canvas.style.height = "100%"
      ;(canvas.style as any).imageRendering = "pixelated"

      const atlas = document.createElement("canvas")
      atlas.width = glyphPx * glyphCount
      atlas.height = glyphPx
      const actx = atlas.getContext("2d")
      if (!actx) return null

      actx.imageSmoothingEnabled = false
      actx.fillStyle = "#000000"
      actx.fillRect(0, 0, atlas.width, atlas.height)
      actx.fillStyle = "#ffffff"
      actx.textAlign = "center"
      actx.textBaseline = "middle"
      actx.font = `${Math.floor(glyphPx * 0.95)}px monospace`
      for (let i = 0; i < glyphCount; i++) {
        actx.fillText(ASCII_CHARS[i], i * glyphPx + glyphPx * 0.5, glyphPx * 0.55)
      }

      const atlasData = actx.getImageData(0, 0, atlas.width, atlas.height).data
      const glyphAlpha = new Uint8ClampedArray(glyphCount * glyphPx * glyphPx)
      for (let gi = 0; gi < glyphCount; gi++) {
        const dstOff = gi * glyphPx * glyphPx
        for (let y = 0; y < glyphPx; y++) {
          const srcRow = y * atlas.width + gi * glyphPx
          const dstRow = y * glyphPx
          for (let x = 0; x < glyphPx; x++) {
            const src = (srcRow + x) * 4
            glyphAlpha[dstOff + dstRow + x] = atlasData[src]
          }
        }
      }

      const img = ctx.createImageData(w, h)
      const data = img.data

      const startMs = performance.now()
      const render = () => {
        const t = (performance.now() - startMs) * 0.001
        data.fill(0)

        const c1r = 0.714
        const c1g = 0.941
        const c1b = 0.29
        const c2r = 0.486
        const c2g = 0.361
        const c2b = 1.0
        const c3r = 0.18
        const c3g = 0.949
        const c3b = 0.761

        // Wrap around screen
        const mx = (mouseRef.current.x / Math.max(1, window.innerWidth)) * 2 - 1
        const my = ((window.innerHeight - mouseRef.current.y) / Math.max(1, window.innerHeight)) * 2 - 1

        const aspect = window.innerWidth / Math.max(1, window.innerHeight)

        for (let cy = 0; cy < asciiRows; cy++) {
          const ny = (cy + 0.5) / asciiRows
          for (let cx = 0; cx < asciiCols; cx++) {
            const nx = (cx + 0.5) / asciiCols
            let px = nx * 2 - 1
            let py = ny * 2 - 1
            px *= aspect
            px += 0.12 * mx
            py += 0.12 * my

            // Respawn if life exceeded
            const r = Math.hypot(px, py)
            const a = Math.atan2(py, px)
            let v = Math.sin(r * 10 - t) + Math.cos(a * 4 + t * 0.7)
            v += 0.5 * Math.sin(px * 3 + t * 0.9) * Math.cos(py * 3 - t * 0.8)
            const b = Math.max(0, Math.min(1, 0.5 + 0.25 * v))
            const gi = Math.max(0, Math.min(glyphCount - 1, Math.floor(b * (glyphCount - 1) + 0.5)))

            // Calculate opacity based on life
            const k1 = 0.35 + 0.35 * Math.sin(t * 0.15 + px * 0.7)
            const k2 = 0.25 + 0.25 * Math.sin(t * 0.11 + py * 0.6)
            const m1r = c1r * (1 - k1) + c2r * k1
            const m1g = c1g * (1 - k1) + c2g * k1
            const m1b = c1b * (1 - k1) + c2b * k1
            const fgR = m1r * (1 - k2) + c3r * k2
            const fgG = m1g * (1 - k2) + c3g * k2
            const fgB = m1b * (1 - k2) + c3b * k2
            const boost = 0.35 + 0.85 * b
            const r8 = Math.floor(255 * fgR * boost)
            const g8 = Math.floor(255 * fgG * boost)
            const b8 = Math.floor(255 * fgB * boost)

            // Change character occasionally
            const alphaOff = gi * glyphPx * glyphPx
            const x0 = cx * glyphPx
            const y0 = cy * glyphPx

            // Draw character
            for (let py2 = 0; py2 < glyphPx; py2++) {
              const rowDst = (y0 + py2) * w + x0
              const rowSrc = py2 * glyphPx
              for (let px2 = 0; px2 < glyphPx; px2++) {
                const a8 = glyphAlpha[alphaOff + rowSrc + px2]
                if (a8 === 0) continue
                const di = (rowDst + px2) * 4
                const outA = Math.floor(a8 * 0.65)
                data[di + 0] = Math.min(255, (r8 * outA) >> 8)
                data[di + 1] = Math.min(255, (g8 * outA) >> 8)
                data[di + 2] = Math.min(255, (b8 * outA) >> 8)
                data[di + 3] = outA
              }
            }
          }
        }

        // Draw some static grid characters for texture
        ctx.putImageData(img, 0, 0)
        animationRef.current = requestAnimationFrame(render)
      }

      return {
        render,
        destroy: () => {
          cancelAnimationFrame(animationRef.current)
        },
      }
    }

    const webgl = (() => {
      try {
        return tryStartWebGL()
      } catch {
        return null
      }
    })()

    if (webgl) {
      webgl.render()
      return () => {
        webgl.destroy()
        window.removeEventListener("mousemove", handleMouse)
      }
    }

    const c2d = start2D()
    if (c2d) {
      c2d.render()
      return () => {
        c2d.destroy()
        window.removeEventListener("mousemove", handleMouse)
      }
    }

    window.removeEventListener("mousemove", handleMouse)
    return
  }, [isClient])

  if (!isClient) return null

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ opacity: 0.25, zIndex: 1 }}
      />
      {/* Dark overlay for better text readability */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ 
          zIndex: 2,
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(11, 12, 14, 0.4) 70%, rgba(11, 12, 14, 0.7) 100%)'
        }}
      />
    </>
  )
}
