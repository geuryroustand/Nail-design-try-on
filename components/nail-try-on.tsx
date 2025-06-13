"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Download, RefreshCw, Share2, Sparkles, AlertTriangle, Camera, Upload, Scissors } from "lucide-react"

// MediaPipe Hands NPM imports
import { Hands, Results, NormalizedLandmark } from '@mediapipe/hands'
import { Camera as MediaPipeCamera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks, HAND_CONNECTIONS } from '@mediapipe/drawing_utils'

// TypeScript interfaces
interface HandLandmark extends NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

interface HandsResults extends Results {
  multiHandLandmarks?: HandLandmark[][]
  multiHandedness?: Array<{
    index: number
    score: number
    label: string
  }>
}

interface ExtractedNailDesign {
  fingerId: string
  canvas: HTMLCanvasElement
  originalPosition: { x: number, y: number }
  rotation: number
  scale: number
  width: number
  height: number
  quality: number
}

interface NailPosition {
  x: number
  y: number
  rotation: number
  width: number
  height: number
  confidence: number
}

// Finger landmark indices for MediaPipe Hands
const FINGER_LANDMARKS = {
  THUMB: { tip: 4, base: 2, mid: 3, pip: 1, mcp: 1 },
  INDEX: { tip: 8, base: 6, mid: 7, pip: 5, mcp: 5 },
  MIDDLE: { tip: 12, base: 10, mid: 11, pip: 9, mcp: 9 },
  RING: { tip: 16, base: 14, mid: 15, pip: 13, mcp: 13 },
  PINKY: { tip: 20, base: 18, mid: 19, pip: 17, mcp: 17 }
} as const

// MediaPipe configuration
const MEDIAPIPE_CONFIG = {
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.8,
  minTrackingConfidence: 0.8,
  selfieMode: false
} as const

export default function NPMNailTryOn() {
  // State management
  const [postImage, setPostImage] = useState<string | null>(null)
  const [userImage, setUserImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [extractedDesigns, setExtractedDesigns] = useState<ExtractedNailDesign[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<'upload' | 'extract' | 'capture' | 'apply'>('upload')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("Upload a nail design image to start.")
  const [handsModel, setHandsModel] = useState<Hands | null>(null)
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)

  // Canvas refs
  const postImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const userImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Initialize MediaPipe Hands
  const initializeMediaPipe = useCallback(async () => {
    try {
      setStatusMessage("Initializing MediaPipe Hands...")
      setProcessingProgress(10)

      // Initialize Hands with NPM package
      const hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        }
      })

      setProcessingProgress(30)

      // Configure MediaPipe options
      await hands.setOptions(MEDIAPIPE_CONFIG)
      
      setProcessingProgress(60)

      // Set up results callback
      hands.onResults((results: HandsResults) => {
        // This will be set by specific processing functions
      })

      setProcessingProgress(100)
      setHandsModel(hands)
      setIsMediaPipeReady(true)
      setStatusMessage("MediaPipe ready! Upload a nail design image to start.")
      
      setTimeout(() => setProcessingProgress(0), 1000)
    } catch (error) {
      console.error('Error initializing MediaPipe:', error)
      setError('Failed to initialize MediaPipe Hands. Please refresh the page and try again.')
      setProcessingProgress(0)
    }
  }, [])

  useEffect(() => {
    initializeMediaPipe()

    return () => {
      if (handsModel) {
        handsModel.close()
      }
    }
  }, [initializeMediaPipe])

  // Validate image quality
  const validateImageQuality = useCallback((image: HTMLImageElement): boolean => {
    const minWidth = 300
    const minHeight = 300
    const maxSize = 10 * 1024 * 1024 // 10MB

    if (image.naturalWidth < minWidth || image.naturalHeight < minHeight) {
      setError(`Image too small. Minimum size: ${minWidth}x${minHeight}px`)
      return false
    }

    return true
  }, [])

  // Handle post image upload
  const handlePostImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      setError("File size too large. Please select an image under 10MB.")
      return
    }

    if (!file.type.startsWith('image/')) {
      setError("Please select a valid image file.")
      return
    }

    setError(null)
    setStatusMessage("Loading image...")

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result) {
        const img = new Image()
        img.onload = () => {
          if (validateImageQuality(img)) {
            setPostImage(result)
            setStatusMessage("Image loaded! Click 'Extract Nail Designs' to analyze.")
          }
        }
        img.onerror = () => setError("Failed to load image. Please try another file.")
        img.src = result
      }
    }
    reader.onerror = () => setError("Failed to read file. Please try again.")
    reader.readAsDataURL(file)
  }, [validateImageQuality])

  // Extract nail designs from post image
  const extractNailDesigns = useCallback(async () => {
    if (!postImage || !handsModel || !isMediaPipeReady) {
      setError("MediaPipe not ready or no image uploaded.")
      return
    }

    setIsLoading(true)
    setStatusMessage("Analyzing hand structure...")
    setProcessingProgress(0)

    try {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = postImage

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("Failed to load image"))
      })

      setProcessingProgress(20)

      // Prepare canvas
      const canvas = postImageCanvasRef.current
      if (!canvas) throw new Error("Canvas not available")

      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas context not available")

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0)

      setProcessingProgress(40)
      setStatusMessage("Detecting hand landmarks...")

      // Process with MediaPipe
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Hand detection timeout"))
        }, 10000)

        handsModel.onResults((results: HandsResults) => {
          clearTimeout(timeout)
          try {
            setProcessingProgress(60)
            setStatusMessage("Extracting nail designs...")
            
            const designs = processHandLandmarks(results, image)
            
            setProcessingProgress(80)
            
            if (designs.length > 0) {
              setExtractedDesigns(designs)
              setCurrentStep('capture')
              setStatusMessage(`Successfully extracted ${designs.length} nail designs!`)
              setProcessingProgress(100)
              setTimeout(() => setProcessingProgress(0), 1000)
            } else {
              throw new Error("No hand detected or unable to extract nail designs")
            }
            
            resolve()
          } catch (err) {
            reject(err)
          }
        })

        handsModel.send({ image: canvas })
      })

    } catch (error) {
      console.error('Error in extractNailDesigns:', error)
      setError(error instanceof Error ? error.message : "Failed to extract nail designs")
      setProcessingProgress(0)
    } finally {
      setIsLoading(false)
    }
  }, [postImage, handsModel, isMediaPipeReady])

  // Process hand landmarks and extract nail designs
  const processHandLandmarks = useCallback((
    results: HandsResults, 
    sourceImage: HTMLImageElement
  ): ExtractedNailDesign[] => {
    if (!results.multiHandLandmarks?.length) {
      throw new Error("No hand landmarks detected")
    }

    const landmarks = results.multiHandLandmarks[0]
    const designs: ExtractedNailDesign[] = []

    Object.entries(FINGER_LANDMARKS).forEach(([fingerName, indices]) => {
      try {
        const design = extractSingleNailDesign(
          fingerName.toLowerCase(),
          landmarks,
          indices,
          sourceImage
        )
        
        if (design && design.quality > 0.3) { // Quality threshold
          designs.push(design)
        }
      } catch (err) {
        console.warn(`Failed to extract ${fingerName} nail:`, err)
      }
    })

    return designs
  }, [])

  // Extract individual nail design
  const extractSingleNailDesign = useCallback((
    fingerId: string,
    landmarks: HandLandmark[],
    indices: typeof FINGER_LANDMARKS.THUMB,
    sourceImage: HTMLImageElement
  ): ExtractedNailDesign | null => {
    const tip = landmarks[indices.tip]
    const base = landmarks[indices.base]
    const mid = landmarks[indices.mid]

    if (!tip || !base || !mid) return null

    // Convert to pixel coordinates
    const w = sourceImage.naturalWidth
    const h = sourceImage.naturalHeight
    
    const tipPx = { x: tip.x * w, y: tip.y * h }
    const basePx = { x: base.x * w, y: base.y * h }
    const midPx = { x: mid.x * w, y: mid.y * h }

    // Calculate nail properties
    const nailLength = Math.sqrt((tipPx.x - basePx.x) ** 2 + (tipPx.y - basePx.y) ** 2)
    const nailWidth = nailLength * 0.75
    const rotation = Math.atan2(tipPx.y - midPx.y, tipPx.x - midPx.x)
    
    // Quality assessment
    const quality = Math.min(
      (tip.visibility || 1) * 
      (base.visibility || 1) * 
      (mid.visibility || 1) * 
      Math.min(nailLength / 50, 1), // Size factor
      1
    )

    if (quality < 0.3 || nailLength < 20) return null

    // Create extraction canvas
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    canvas.width = Math.max(nailWidth * 1.5, 60)
    canvas.height = Math.max(nailLength * 1.5, 80)

    // Calculate center point (biased toward tip)
    const centerX = tipPx.x * 0.75 + basePx.x * 0.25
    const centerY = tipPx.y * 0.75 + basePx.y * 0.25

    // Extract and rotate nail region
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(-rotation)

    try {
      ctx.drawImage(
        sourceImage,
        Math.max(0, centerX - canvas.width / 2),
        Math.max(0, centerY - canvas.height / 2),
        Math.min(canvas.width, w),
        Math.min(canvas.height, h),
        -canvas.width / 2,
        -canvas.height / 2,
        canvas.width,
        canvas.height
      )
    } catch (err) {
      ctx.restore()
      return null
    }

    ctx.restore()

    // Advanced background removal
    removeBackgroundAdvanced(ctx, canvas.width, canvas.height)

    return {
      fingerId,
      canvas,
      originalPosition: { x: centerX, y: centerY },
      rotation,
      scale: nailLength / 100,
      width: nailWidth,
      height: nailLength,
      quality
    }
  }, [])

  // Advanced background removal with multiple algorithms
  const removeBackgroundAdvanced = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      if (isSkinToneAdvanced(r, g, b) || isBackgroundPixel(r, g, b)) {
        data[i + 3] = 0 // Make transparent
      } else {
        // Enhance nail colors
        data[i] = Math.min(255, r * 1.1)
        data[i + 1] = Math.min(255, g * 1.1)
        data[i + 2] = Math.min(255, b * 1.1)
        data[i + 3] = Math.min(255, data[i + 3] * 1.2)
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  // Advanced skin tone detection
  const isSkinToneAdvanced = useCallback((r: number, g: number, b: number): boolean => {
    // Method 1: RGB ratios
    const method1 = r > 95 && g > 40 && b > 20 && 
                   Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
                   Math.abs(r - g) > 15 && r > g && r > b

    // Method 2: YCrCb color space (approximation)
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    const cr = 0.713 * (r - y) + 128
    const cb = 0.564 * (b - y) + 128
    const method2 = y > 80 && cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127

    // Method 3: HSV-based detection
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    const s = max === 0 ? 0 : delta / max
    const v = max / 255
    
    let h = 0
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6
      else if (max === g) h = (b - r) / delta + 2
      else h = (r - g) / delta + 4
      h *= 60
      if (h < 0) h += 360
    }
    
    const method3 = h >= 0 && h <= 50 && s >= 0.23 && s <= 0.68 && v >= 0.35

    // Method 4: Simple range-based
    const method4 = r > 120 && g > 80 && b > 50 && r > b && g > b

    return method1 || method2 || method3 || method4
  }, [])

  // Background pixel detection
  const isBackgroundPixel = useCallback((r: number, g: number, b: number): boolean => {
    const brightness = r + g + b
    const variance = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
    
    return brightness < 60 || brightness > 720 || (variance < 20 && brightness > 600)
  }, [])

  // Handle user image upload
  const handleUserImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setError("File size too large. Please select an image under 10MB.")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result) {
        setUserImage(result)
        setError(null)
        setStatusMessage("Processing your hand...")
        applyDesignsToUserImage(result)
      }
    }
    reader.onerror = () => setError("Failed to read file.")
    reader.readAsDataURL(file)
  }, [])

  // Apply designs to user image
  const applyDesignsToUserImage = useCallback(async (imageDataUrl: string) => {
    if (!handsModel || !extractedDesigns.length) {
      setError("No designs available or MediaPipe not ready.")
      return
    }

    setIsLoading(true)
    setProcessingProgress(0)

    try {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = imageDataUrl

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("Failed to load user image"))
      })

      setProcessingProgress(30)

      const canvas = userImageCanvasRef.current
      if (!canvas) throw new Error("Canvas not available")

      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas context not available")

      ctx.drawImage(image, 0, 0)

      setProcessingProgress(50)
      setStatusMessage("Detecting your hand...")

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Hand detection timeout"))
        }, 10000)

        handsModel.onResults((results: HandsResults) => {
          clearTimeout(timeout)
          try {
            setProcessingProgress(70)
            setStatusMessage("Applying nail designs...")
            
            applyDesignsToCanvas(results, image)
            resolve()
          } catch (err) {
            reject(err)
          }
        })

        handsModel.send({ image: canvas })
      })

    } catch (error) {
      console.error('Error applying designs:', error)
      setError(error instanceof Error ? error.message : "Failed to apply designs")
      setProcessingProgress(0)
    } finally {
      setIsLoading(false)
    }
  }, [handsModel, extractedDesigns])

  // Apply designs to canvas
  const applyDesignsToCanvas = useCallback((
    results: HandsResults,
    originalImage: HTMLImageElement
  ) => {
    const canvas = resultCanvasRef.current
    if (!canvas) throw new Error("Result canvas not available")

    canvas.width = originalImage.naturalWidth
    canvas.height = originalImage.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas context not available")

    // Draw original image
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(originalImage, 0, 0)

    if (!results.multiHandLandmarks?.length) {
      throw new Error("No hand detected in your image")
    }

    const landmarks = results.multiHandLandmarks[0]
    let appliedCount = 0

    setProcessingProgress(80)

    // Apply each design
    Object.entries(FINGER_LANDMARKS).forEach(([fingerName, indices], index) => {
      const design = extractedDesigns.find(d => d.fingerId === fingerName.toLowerCase()) || extractedDesigns[index]
      if (!design) return

      const tip = landmarks[indices.tip]
      const base = landmarks[indices.base]
      const mid = landmarks[indices.mid]

      if (!tip || !base || !mid) return

      // Calculate position and scale
      const w = canvas.width
      const h = canvas.height
      
      const tipPx = { x: tip.x * w, y: tip.y * h }
      const basePx = { x: base.x * w, y: base.y * h }
      const midPx = { x: mid.x * w, y: mid.y * h }

      const nailLength = Math.sqrt((tipPx.x - basePx.x) ** 2 + (tipPx.y - basePx.y) ** 2)
      const rotation = Math.atan2(tipPx.y - midPx.y, tipPx.x - midPx.x)
      const scale = nailLength / design.height
      
      const centerX = tipPx.x * 0.75 + basePx.x * 0.25
      const centerY = tipPx.y * 0.75 + basePx.y * 0.25

      // Apply design
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(rotation)
      ctx.scale(scale, scale)
      
      // Use appropriate blending mode
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = 0.85
      
      ctx.drawImage(
        design.canvas,
        -design.canvas.width / 2,
        -design.canvas.height / 2
      )
      
      ctx.restore()
      appliedCount++
    })

    setProcessingProgress(100)

    if (appliedCount > 0) {
      setProcessedImage(canvas.toDataURL("image/png", 0.9))
      setCurrentStep('apply')
      setStatusMessage(`Successfully applied ${appliedCount} nail designs!`)
    } else {
      throw new Error("Could not apply any designs to your hand")
    }

    setTimeout(() => setProcessingProgress(0), 1000)
  }, [extractedDesigns])

  // Camera capture
  const handleCameraCapture = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.")
      return
    }

    navigator.mediaDevices
      .getUserMedia({ 
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
      .then((stream) => {
        const modal = document.createElement("div")
        modal.className = "fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center"

        const video = document.createElement("video")
        video.className = "max-w-full max-h-[80vh] transform scale-x-[-1]"
        video.srcObject = stream
        video.autoplay = true
        modal.appendChild(video)

        const buttonContainer = document.createElement("div")
        buttonContainer.className = "flex gap-4 mt-6"

        const captureBtn = document.createElement("button")
        captureBtn.textContent = "📸 Capture"
        captureBtn.className = "px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
        buttonContainer.appendChild(captureBtn)

        const cancelBtn = document.createElement("button")
        cancelBtn.textContent = "❌ Cancel"
        cancelBtn.className = "px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
        buttonContainer.appendChild(cancelBtn)

        modal.appendChild(buttonContainer)
        document.body.appendChild(modal)

        captureBtn.onclick = () => {
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          if (ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.scale(-1, 1)
            ctx.drawImage(video, -canvas.width, 0)
            
            const imageDataUrl = canvas.toDataURL("image/png")
            
            stream.getTracks().forEach(track => track.stop())
            document.body.removeChild(modal)
            
            setUserImage(imageDataUrl)
            setStatusMessage("Processing captured image...")
            applyDesignsToUserImage(imageDataUrl)
          }
        }

        cancelBtn.onclick = () => {
          stream.getTracks().forEach(track => track.stop())
          document.body.removeChild(modal)
        }
      })
      .catch((err) => {
        console.error("Camera error:", err)
        setError("Failed to access camera. Please check permissions.")
      })
  }, [applyDesignsToUserImage])

  // Save image
  const handleSaveImage = useCallback(() => {
    if (!processedImage) return

    const link = document.createElement("a")
    link.download = `nail-design-${Date.now()}.png`
    link.href = processedImage
    link.click()
    setStatusMessage("Image saved successfully!")
  }, [processedImage])

  // Share image
  const handleShare = useCallback(async () => {
    if (!processedImage) return

    try {
      const response = await fetch(processedImage)
      const blob = await response.blob()
      const file = new File([blob], "nail-design.png", { type: "image/png" })
      
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "My Virtual Nail Design!",
          text: "Check out this amazing nail design I created!",
          files: [file],
        })
        setStatusMessage("Image shared successfully!")
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ])
        setStatusMessage("Image copied to clipboard!")
      }
    } catch (err) {
      console.error("Share/copy failed:", err)
      handleSaveImage()
      setStatusMessage("Saved image instead.")
    }
  }, [processedImage, handleSaveImage])

  // Reset application
  const handleReset = useCallback(() => {
    setPostImage(null)
    setUserImage(null)
    setProcessedImage(null)
    setExtractedDesigns([])
    setCurrentStep('upload')
    setError(null)
    setProcessingProgress(0)
    setStatusMessage("Upload a nail design image to start.")
  }, [])

  return (
    <div className="w-full max-w-5xl mx-auto p-6 bg-white shadow-xl rounded-lg">
      {/* Hidden canvases */}
      <canvas ref={postImageCanvasRef} className="hidden" />
      <canvas ref={userImageCanvasRef} className="hidden" />
      <canvas ref={resultCanvasRef} className="hidden" />

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold text-pink-600 mb-2">Professional Nail Design Try-On</h1>
        <p className="text-gray-600 mb-4">Extract real nail designs and apply them with AI precision</p>
        
        {/* MediaPipe Status */}
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
          isMediaPipeReady 
            ? 'bg-green-100 text-green-800' 
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isMediaPipeReady ? 'bg-green-500' : 'bg-yellow-500'
          }`} />
          {isMediaPipeReady ? 'MediaPipe Ready' : 'Loading MediaPipe...'}
        </div>
      </div>

      {/* Progress Bar */}
      {processingProgress > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">Processing...</span>
            <span className="text-sm text-gray-600">{processingProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-pink-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {[
            { step: 'upload', icon: Upload, label: 'Upload Design' },
            { step: 'extract', icon: Scissors, label: 'Extract Patterns' },
            { step: 'capture', icon: Camera, label: 'Capture Hand' },
            { step: 'apply', icon: Sparkles, label: 'Apply Design' }
          ].map(({ step, icon: Icon, label }, index) => (
            <div key={step} className="flex items-center">
              <div className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                currentStep === step ? '
