"use client"

import { forwardRef, useMemo } from "react"
import { Effect, BlendFunction } from "postprocessing"
import { Uniform, Vector2 } from "three"
import { extend } from "@react-three/fiber"

const fragmentShader = `
uniform float cellSize;
uniform bool invert;
uniform bool colorMode;
uniform int asciiStyle;
uniform float time;
uniform vec2 resolution;
uniform float scanlineIntensity;
uniform float scanlineCount;
uniform float vignetteIntensity;
uniform float vignetteRadius;
uniform int colorPalette;
uniform float noiseIntensity;
uniform float noiseScale;
uniform float noiseSpeed;
uniform float brightnessAdjust;
uniform float contrastAdjust;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec3 applyColorPalette(vec3 color, int palette) {
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  if (palette == 1) { // Green (AmpliFi lime)
    return vec3(lum * 0.71, lum * 0.94, lum * 0.29);
  } else if (palette == 2) { // Purple
    return vec3(lum * 0.49, lum * 0.36, lum * 1.0);
  } else if (palette == 3) { // Teal
    return vec3(lum * 0.18, lum * 0.95, lum * 0.76);
  } else if (palette == 4) { // Cyan
    return vec3(0.0, lum * 0.8, lum);
  }
  return color;
}

float getChar(float brightness, vec2 p, int style) {
  vec2 grid = floor(p * 4.0);
  float val = 0.0;
  if (style == 0) { // Standard
    if (brightness < 0.2) val = (grid.x == 1.0 && grid.y == 1.0) ? 0.3 : 0.0;
    else if (brightness < 0.35) val = (grid.x == 1.0 || grid.x == 2.0) && (grid.y == 1.0 || grid.y == 2.0) ? 1.0 : 0.0;
    else if (brightness < 0.5) val = (grid.y == 1.0 || grid.y == 2.0) ? 1.0 : 0.0;
    else if (brightness < 0.65) val = (grid.y == 0.0 || grid.y == 3.0) ? 1.0 : (grid.y == 1.0 || grid.y == 2.0) ? 0.5 : 0.0;
    else if (brightness < 0.8) val = (grid.x == 0.0 || grid.x == 2.0 || grid.y == 0.0 || grid.y == 2.0) ? 1.0 : 0.3;
    else val = 1.0;
  } else if (style == 1) { // Minimal dots
    float dist = length(p - 0.5);
    val = brightness > 0.3 ? smoothstep(0.4, 0.2, dist) * brightness : 0.0;
  } else if (style == 2) { // Blocks
    val = brightness > 0.2 ? brightness : 0.0;
  }
  return val;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 workUV = uv;

  vec4 sampledColor = texture(inputBuffer, workUV);
  
  // Contrast and brightness
  sampledColor.rgb = (sampledColor.rgb - 0.5) * contrastAdjust + 0.5 + brightnessAdjust;

  // Time-based noise
  if (noiseIntensity > 0.0) {
    float noiseVal = noise(workUV * noiseScale + time * noiseSpeed);
    sampledColor.rgb += (noiseVal - 0.5) * noiseIntensity;
  }

  vec2 cellCount = resolution / cellSize;
  vec2 cellCoord = floor(uv * cellCount);
  vec2 cellUV = (cellCoord + 0.5) / cellCount;
  vec4 cellColor = texture(inputBuffer, cellUV);
  float brightness = dot(cellColor.rgb, vec3(0.299, 0.587, 0.114));

  if (invert) brightness = 1.0 - brightness;

  vec2 localUV = fract(uv * cellCount);
  float charValue = getChar(brightness, localUV, asciiStyle);

  vec3 finalColor;
  if (colorMode) {
    finalColor = cellColor.rgb * charValue;
  } else {
    finalColor = vec3(brightness * charValue);
  }

  finalColor = applyColorPalette(finalColor, colorPalette);

  // Scanlines
  if (scanlineIntensity > 0.0) {
    float scanline = sin(uv.y * scanlineCount * 3.14159) * 0.5 + 0.5;
    finalColor *= 1.0 - (scanline * scanlineIntensity);
  }

  // Vignette
  if (vignetteIntensity > 0.0) {
    vec2 centered = uv * 2.0 - 1.0;
    float vignette = 1.0 - dot(centered, centered) / vignetteRadius;
    finalColor *= mix(1.0, vignette, vignetteIntensity);
  }

  outputColor = vec4(finalColor, cellColor.a);
}
`

let _time = 0
let _cellSize = 8
let _invert = false
let _colorMode = true
let _asciiStyle = 0
let _resolution = new Vector2(1920, 1080)

class AsciiEffectImpl extends Effect {
  constructor(options: any) {
    const {
      cellSize = 8,
      invert = false,
      color = true,
      style = 0,
      resolution = new Vector2(1920, 1080),
      postfx = {}
    } = options

    super("AsciiEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["cellSize", new Uniform(cellSize)],
        ["invert", new Uniform(invert)],
        ["colorMode", new Uniform(color)],
        ["asciiStyle", new Uniform(style)],
        ["time", new Uniform(0)],
        ["resolution", new Uniform(resolution)],
        ["scanlineIntensity", new Uniform(postfx.scanlineIntensity || 0)],
        ["scanlineCount", new Uniform(postfx.scanlineCount || 200)],
        ["vignetteIntensity", new Uniform(postfx.vignetteIntensity || 0)],
        ["vignetteRadius", new Uniform(postfx.vignetteRadius || 0.8)],
        ["colorPalette", new Uniform(postfx.colorPalette || 0)],
        ["noiseIntensity", new Uniform(postfx.noiseIntensity || 0)],
        ["noiseScale", new Uniform(postfx.noiseScale || 1)],
        ["noiseSpeed", new Uniform(postfx.noiseSpeed || 1)],
        ["brightnessAdjust", new Uniform(postfx.brightnessAdjust || 0)],
        ["contrastAdjust", new Uniform(postfx.contrastAdjust || 1)],
      ]),
    })

    _cellSize = cellSize
    _invert = invert
    _colorMode = color
    _asciiStyle = style
    _resolution = resolution
  }

  update(_renderer: any, _inputBuffer: any, deltaTime: number) {
    _time += deltaTime
    this.uniforms.get("time")!.value = _time
    this.uniforms.get("cellSize")!.value = _cellSize
    this.uniforms.get("invert")!.value = _invert
    this.uniforms.get("colorMode")!.value = _colorMode
    this.uniforms.get("asciiStyle")!.value = _asciiStyle
    this.uniforms.get("resolution")!.value = _resolution
  }
}

interface AsciiEffectProps {
  style?: "standard" | "minimal" | "blocks"
  cellSize?: number
  invert?: boolean
  color?: boolean
  postfx?: {
    scanlineIntensity?: number
    scanlineCount?: number
    vignetteIntensity?: number
    vignetteRadius?: number
    colorPalette?: number
    noiseIntensity?: number
    noiseScale?: number
    noiseSpeed?: number
    brightnessAdjust?: number
    contrastAdjust?: number
  }
  resolution?: Vector2
}

export const AsciiEffect = forwardRef<any, AsciiEffectProps>((props, ref) => {
  const {
    style = "standard",
    cellSize = 8,
    invert = false,
    color = true,
    postfx = {},
    resolution = new Vector2(1920, 1080),
  } = props

  const styleMap: Record<string, number> = { standard: 0, minimal: 1, blocks: 2 }
  const styleNum = styleMap[style] || 0

  _cellSize = cellSize
  _invert = invert
  _colorMode = color
  _asciiStyle = styleNum
  _resolution = resolution

  const effect = useMemo(
    () => new AsciiEffectImpl({ cellSize, invert, color, style: styleNum, postfx, resolution }),
    []
  )

  return <primitive ref={ref} object={effect} />
})

AsciiEffect.displayName = "AsciiEffect"
