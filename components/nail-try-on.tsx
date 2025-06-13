"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Download, RefreshCw, Share2, Sparkles, AlertTriangle, Camera, Upload, Scissors } from "lucide-react"

// MediaPipe Hands types
interface HandLandmark {
  x: number
  y: number
  z?: number
}

interface HandsResults {
  multiHandLandmarks?: HandLandmark[][]
  multiHandedness?: any[]
}

// Finger landmark indices for MediaPipe Hands
const FINGER_LANDMARKS = {
  THUMB: { tip: 4, base: 2, mid: 3, pip: 1 },
  INDEX: { tip: 8, base: 6, mid: 7, pip: 5 },
  MIDDLE: { tip: 12, base: 10, mid: 11, pip: 9 },
  RING: { tip: 16, base: 14, mid: 15, pip: 13 },
  PINKY: { tip: 20, base: 18, mid: 19, pip: 17 },
}

interface ExtractedNailDesign {
  fingerId: string
  canvas: HTMLCanvasElement
  originalPosition: { x: number; y: number }
  rotation: number
  scale: number
  width: number
  height: number
}

export default function ProfessionalNailTryOn() {
  // State management
  const [postImage, setPostImage] = useState<string | null>(null)
  const [userImage, setUserImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [extractedDesigns, setExtractedDesigns] = useState<ExtractedNailDesign[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<"upload" | "extract" | "capture" | "apply">("upload")
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("Upload a nail design image to start.")
  const [handsModel, setHandsModel] = useState<any>(null)
  const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Canvas refs
  const postImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const userImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const extractionCanvasRef = useRef<HTMLCanvasElement>(null)

  // Initialize MediaPipe Hands
  const initializeHands = useCallback(() => {
    try {
      if (typeof window === "undefined" || !(window as any).Hands) {
        setError("MediaPipe Hands not available. Please refresh the page.")
        return
      }

      const hands = new (window as any).Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.8,
      })

      setHandsModel(hands)
      setStatusMessage("MediaPipe loaded successfully! Upload a nail design image to start.")
    } catch (err) {
      console.error("Error initializing MediaPipe Hands:", err)
      setError("Failed to initialize hand detection. Please refresh the page.")
    }
  }, [])

  // Load MediaPipe Hands
  const loadMediaPipeHands = useCallback(() => {
    // Prevent multiple initializations
    if (isInitialized) return
    setIsInitialized(true)

    // Check if MediaPipe is already loaded
    if (typeof window !== "undefined" && (window as any).Hands) {
      initializeHands()
      setIsMediaPipeLoaded(true)
      return
    }

    try {
      // Load MediaPipe Hands script
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.min.js"
      script.async = true
      script.crossOrigin = "anonymous"

      script.onload = () => {
        // Load drawing utils
        const drawingUtilsScript = document.createElement("script")
        drawingUtilsScript.src = "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"
        drawingUtilsScript.async = true
        drawingUtilsScript.crossOrigin = "anonymous"

        drawingUtilsScript.onload = () => {
          setIsMediaPipeLoaded(true)
          initializeHands()
        }

        drawingUtilsScript.onerror = () => {
          setError("Failed to load MediaPipe drawing utilities. Please check your internet connection.")
        }

        document.head.appendChild(drawingUtilsScript)
      }

      script.onerror = () => {
        setError("Failed to load MediaPipe Hands. Please check your internet connection.")
      }

      document.head.appendChild(script)
    } catch (err) {
      console.error("Error loading MediaPipe:", err)
      setError("Failed to initialize MediaPipe. Please refresh the page.")
    }
  }, [initializeHands, isInitialized])

  useEffect(() => {
    loadMediaPipeHands()

    return () => {
      if (handsModel) {
        try {
          handsModel.close()
        } catch (err) {
          console.error("Error closing MediaPipe Hands:", err)
        }
      }
    }
  }, [loadMediaPipeHands]) // Remove handsModel from dependencies

  // Handle post image upload
  const handlePostImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0]

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          setError("File size too large. Please select an image under 10MB.")
          return
        }

        const reader = new FileReader()

        reader.onload = (readerEvent) => {
          if (readerEvent.target?.result) {
            const imageDataUrl = readerEvent.target.result as string
            setPostImage(imageDataUrl)
            setError(null)
            setStatusMessage("Image uploaded! Click 'Extract Nail Designs' to analyze the patterns.")
          }
        }

        reader.onerror = () => {
          setError("Failed to read the selected file. Please try another image.")
        }

        reader.readAsDataURL(file)
      }
    } catch (err) {
      console.error("Error in handlePostImageUpload:", err)
      setError("Failed to process the selected file. Please try another image.")
    }
  }, [])

  // Extract nail designs from post image
  const extractNailDesigns = useCallback(async () => {
    if (!postImage || !handsModel) {
      setError("Please upload an image and ensure MediaPipe is loaded.")
      return
    }

    setIsLoading(true)
    setStatusMessage("Analyzing hand and extracting nail designs...")

    try {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = postImage

      image.onload = async () => {
        try {
          const canvas = postImageCanvasRef.current
          if (!canvas) {
            setError("Canvas not ready.")
            setIsLoading(false)
            return
          }

          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            setError("Could not get canvas context.")
            setIsLoading(false)
            return
          }
          ctx.drawImage(image, 0, 0)

          handsModel.onResults((results: HandsResults) => {
            extractDesignsFromDetectedHand(results, image)
          })

          await handsModel.send({ image: canvas })
        } catch (err) {
          console.error("Error processing image with MediaPipe:", err)
          setError("Error processing hand detection. Please try another photo with a clearly visible hand.")
          setIsLoading(false)
        }
      }

      image.onerror = () => {
        setError("Failed to load the uploaded image. Please try another file.")
        setIsLoading(false)
      }
    } catch (err) {
      console.error("Error in extractNailDesigns:", err)
      setError("Failed to extract designs. Please try another image.")
      setIsLoading(false)
    }
  }, [postImage, handsModel])

  // Extract designs from detected hand landmarks
  const extractDesignsFromDetectedHand = useCallback((results: HandsResults, originalImage: HTMLImageElement) => {
    try {
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        setError("No hand detected in the image. Please try an image with a clearly visible hand.")
        setIsLoading(false)
        return
      }

      const handLandmarks = results.multiHandLandmarks[0]
      const extractedDesigns: ExtractedNailDesign[] = []

      // Process each finger
      Object.entries(FINGER_LANDMARKS).forEach(([fingerName, landmarks]) => {
        try {
          const tipLandmark = handLandmarks[landmarks.tip]
          const baseLandmark = handLandmarks[landmarks.base]
          const midLandmark = handLandmarks[landmarks.mid]

          if (tipLandmark && baseLandmark && midLandmark) {
            const design = extractSingleNailDesign(
              fingerName.toLowerCase(),
              tipLandmark,
              baseLandmark,
              midLandmark,
              originalImage,
            )

            if (design) {
              extractedDesigns.push(design)
            }
          }
        } catch (err) {
          console.error(`Error extracting design for ${fingerName}:`, err)
        }
      })

      if (extractedDesigns.length > 0) {
        setExtractedDesigns(extractedDesigns)
        setCurrentStep("capture")
        setStatusMessage(
          `Successfully extracted ${extractedDesigns.length} nail designs! Now capture your hand to apply them.`,
        )
      } else {
        setError("Could not extract any nail designs. Please try an image with clearer nail visibility.")
      }

      setIsLoading(false)
    } catch (err) {
      console.error("Error in extractDesignsFromDetectedHand:", err)
      setError("Error extracting nail designs. Please try another image.")
      setIsLoading(false)
    }
  }, [])

  // Extract single nail design
  const extractSingleNailDesign = useCallback(
    (
      fingerId: string,
      tip: HandLandmark,
      base: HandLandmark,
      mid: HandLandmark,
      sourceImage: HTMLImageElement,
    ): ExtractedNailDesign | null => {
      try {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) return null

        // Convert normalized coordinates to pixel coordinates
        const tipPx = { x: tip.x * sourceImage.naturalWidth, y: tip.y * sourceImage.naturalHeight }
        const basePx = { x: base.x * sourceImage.naturalWidth, y: base.y * sourceImage.naturalHeight }
        const midPx = { x: mid.x * sourceImage.naturalWidth, y: mid.y * sourceImage.naturalHeight }

        // Calculate nail dimensions
        const nailLength = Math.sqrt(Math.pow(tipPx.x - basePx.x, 2) + Math.pow(tipPx.y - basePx.y, 2))
        const nailWidth = nailLength * 0.8 // Nail width ratio

        // Calculate rotation
        const rotation = Math.atan2(tipPx.y - midPx.y, tipPx.x - midPx.x)

        // Set canvas size
        canvas.width = Math.max(nailWidth * 1.5, 80)
        canvas.height = Math.max(nailLength * 1.5, 100)

        // Calculate nail center (closer to tip)
        const centerX = tipPx.x * 0.7 + basePx.x * 0.3
        const centerY = tipPx.y * 0.7 + basePx.y * 0.3

        // Extract nail region
        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(-rotation)

        // Extract area around the nail
        const extractX = Math.max(0, centerX - canvas.width / 2)
        const extractY = Math.max(0, centerY - canvas.height / 2)
        const extractWidth = Math.min(canvas.width, sourceImage.naturalWidth - extractX)
        const extractHeight = Math.min(canvas.height, sourceImage.naturalHeight - extractY)

        if (extractWidth > 0 && extractHeight > 0) {
          ctx.drawImage(
            sourceImage,
            extractX,
            extractY,
            extractWidth,
            extractHeight,
            -canvas.width / 2,
            -canvas.height / 2,
            canvas.width,
            canvas.height,
          )
        }

        ctx.restore()

        // Apply background removal (advanced skin tone detection)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          // Multiple skin tone detection algorithms
          const isSkinTone = detectSkinTone(r, g, b)
          const isBackground = detectBackground(r, g, b)

          if (isSkinTone || isBackground) {
            data[i + 3] = 0 // Make transparent
          } else {
            // Enhance nail design colors
            const brightness = 1.2
            data[i] = Math.min(255, r * brightness)
            data[i + 1] = Math.min(255, g * brightness)
            data[i + 2] = Math.min(255, b * brightness)
          }
        }

        ctx.putImageData(imageData, 0, 0)

        return {
          fingerId,
          canvas,
          originalPosition: { x: centerX, y: centerY },
          rotation,
          scale: nailLength / 100,
          width: nailWidth,
          height: nailLength,
        }
      } catch (err) {
        console.error(`Error extracting nail design for ${fingerId}:`, err)
        return null
      }
    },
    [],
  )

  // Advanced skin tone detection
  const detectSkinTone = useCallback((r: number, g: number, b: number): boolean => {
    // Multiple skin tone detection methods
    const method1 =
      r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15 && r > g && r > b

    const method2 = r > 120 && g > 80 && b > 50 && r > b && g > b && Math.abs(r - g) < 50

    const method3 =
      r >= 60 &&
      r <= 255 &&
      g >= 40 &&
      g <= 255 &&
      b >= 20 &&
      b <= 255 &&
      r > g &&
      g > b &&
      r > b &&
      r - g >= 10 &&
      g - b >= 5

    const method4 = r > 80 && g > 50 && b > 30 && r > b && g > b

    return method1 || method2 || method3 || method4
  }, [])

  // Background detection
  const detectBackground = useCallback((r: number, g: number, b: number): boolean => {
    const brightness = r + g + b
    const isVeryDark = brightness < 50
    const isVeryLight = brightness > 700
    const isNeutral = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15

    return isVeryDark || isVeryLight || (isNeutral && brightness > 600)
  }, [])

  // Handle user image upload
  const handleUserImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0]

        if (file.size > 10 * 1024 * 1024) {
          setError("File size too large. Please select an image under 10MB.")
          return
        }

        const reader = new FileReader()

        reader.onload = (readerEvent) => {
          if (readerEvent.target?.result) {
            const imageDataUrl = readerEvent.target.result as string
            setUserImage(imageDataUrl)
            setProcessedImage(null)
            setError(null)
            setStatusMessage("Processing your image...")
            applyDesignsToUserHand(imageDataUrl)
          }
        }

        reader.onerror = () => {
          setError("Failed to read the selected file. Please try another image.")
        }

        reader.readAsDataURL(file)
      }
    } catch (err) {
      console.error("Error in handleUserImageUpload:", err)
      setError("Failed to process the selected file. Please try another image.")
    }
  }, [])

  // Apply extracted designs to user's hand
  const applyDesignsToUserHand = useCallback(
    async (imageDataUrl: string) => {
      if (!handsModel || extractedDesigns.length === 0) {
        setError("No designs extracted or MediaPipe not ready.")
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        const image = new Image()
        image.crossOrigin = "anonymous"
        image.src = imageDataUrl

        image.onload = async () => {
          try {
            const userCanvas = userImageCanvasRef.current
            if (!userCanvas) {
              setError("Canvas not ready.")
              setIsLoading(false)
              return
            }

            userCanvas.width = image.naturalWidth
            userCanvas.height = image.naturalHeight
            const ctx = userCanvas.getContext("2d")
            if (!ctx) {
              setError("Could not get canvas context.")
              setIsLoading(false)
              return
            }
            ctx.drawImage(image, 0, 0)

            handsModel.onResults((results: HandsResults) => {
              applyDesignsToDetectedHand(results, image)
            })

            await handsModel.send({ image: userCanvas })
          } catch (err) {
            console.error("Error processing user image:", err)
            setError("Error processing hand detection. Please try another photo.")
            setIsLoading(false)
          }
        }

        image.onerror = () => {
          setError("Failed to load user image for processing.")
          setIsLoading(false)
        }
      } catch (err) {
        console.error("Error in applyDesignsToUserHand:", err)
        setError("Failed to apply designs. Please try another image.")
        setIsLoading(false)
      }
    },
    [handsModel, extractedDesigns],
  )

  // Apply designs to detected hand
  const applyDesignsToDetectedHand = useCallback(
    (results: HandsResults, originalImage: HTMLImageElement) => {
      try {
        const resultCanvas = resultCanvasRef.current
        if (!resultCanvas) {
          setError("Result canvas not ready.")
          setIsLoading(false)
          return
        }

        resultCanvas.width = originalImage.naturalWidth
        resultCanvas.height = originalImage.naturalHeight
        const ctx = resultCanvas.getContext("2d")
        if (!ctx) {
          setError("Could not get result canvas context.")
          setIsLoading(false)
          return
        }

        // Draw original image
        ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height)
        ctx.drawImage(originalImage, 0, 0, resultCanvas.width, resultCanvas.height)

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const handLandmarks = results.multiHandLandmarks[0]
          let designsApplied = 0

          // Apply extracted designs to each finger
          Object.entries(FINGER_LANDMARKS).forEach(([fingerName, landmarks], index) => {
            const tipLandmark = handLandmarks[landmarks.tip]
            const baseLandmark = handLandmarks[landmarks.base]
            const midLandmark = handLandmarks[landmarks.mid]

            if (tipLandmark && baseLandmark && midLandmark && extractedDesigns[index]) {
              const design = extractedDesigns[index]

              // Calculate position and rotation for user's hand
              const tip = { x: tipLandmark.x * resultCanvas.width, y: tipLandmark.y * resultCanvas.height }
              const base = { x: baseLandmark.x * resultCanvas.width, y: baseLandmark.y * resultCanvas.height }
              const mid = { x: midLandmark.x * resultCanvas.width, y: midLandmark.y * resultCanvas.height }

              const nailLength = Math.sqrt(Math.pow(tip.x - base.x, 2) + Math.pow(tip.y - base.y, 2))
              const rotation = Math.atan2(tip.y - mid.y, tip.x - mid.x)

              // Calculate center position
              const centerX = tip.x * 0.7 + base.x * 0.3
              const centerY = tip.y * 0.7 + base.y * 0.3

              // Scale design to match user's nail size
              const scale = nailLength / design.height

              ctx.save()
              ctx.translate(centerX, centerY)
              ctx.rotate(rotation)
              ctx.scale(scale, scale)

              // Apply design with blending mode for better integration
              ctx.globalCompositeOperation = "multiply"
              ctx.globalAlpha = 0.8

              ctx.drawImage(design.canvas, -design.canvas.width / 2, -design.canvas.height / 2)

              ctx.restore()
              designsApplied++
            }
          })

          if (designsApplied > 0) {
            setStatusMessage(`Successfully applied ${designsApplied} nail designs! Check out your virtual manicure.`)
          } else {
            setStatusMessage("Could not apply designs. Please ensure your hand is clearly visible.")
          }

          setProcessedImage(resultCanvas.toDataURL("image/png"))
          setCurrentStep("apply")
        } else {
          setStatusMessage("No hand detected in your image. Please try a clearer photo.")
          setProcessedImage(resultCanvas.toDataURL("image/png"))
        }
      } catch (err) {
        console.error("Error in applyDesignsToDetectedHand:", err)
        setError("Error applying nail designs. Please try another photo.")
      } finally {
        setIsLoading(false)
      }
    },
    [extractedDesigns],
  )

  // Camera capture functionality
  const handleCameraCapture = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera access is not supported in your browser.")
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: 1280, height: 720 } })
      .then((stream) => {
        const modal = document.createElement("div")
        modal.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.9); z-index: 1000;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        `

        const video = document.createElement("video")
        video.style.cssText = "max-width: 100%; max-height: 80%; transform: scaleX(-1);"
        video.srcObject = stream
        video.autoplay = true
        modal.appendChild(video)

        const captureBtn = document.createElement("button")
        captureBtn.textContent = "Take Photo"
        captureBtn.style.cssText = `
          margin: 20px; padding: 12px 24px; background: #ec4899; color: white;
          border: none; border-radius: 8px; cursor: pointer; font-size: 16px;
        `
        modal.appendChild(captureBtn)

        const cancelBtn = document.createElement("button")
        cancelBtn.textContent = "Cancel"
        cancelBtn.style.cssText = `
          padding: 12px 24px; background: #6b7280; color: white;
          border: none; border-radius: 8px; cursor: pointer; font-size: 16px;
        `
        modal.appendChild(cancelBtn)

        document.body.appendChild(modal)

        captureBtn.onclick = () => {
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          if (ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.scale(-1, 1) // Flip horizontally
            ctx.drawImage(video, -canvas.width, 0)
            const imageDataUrl = canvas.toDataURL("image/png")

            stream.getTracks().forEach((track) => track.stop())
            document.body.removeChild(modal)

            setUserImage(imageDataUrl)
            setProcessedImage(null)
            setError(null)
            setStatusMessage("Processing your image...")
            applyDesignsToUserHand(imageDataUrl)
          }
        }

        cancelBtn.onclick = () => {
          stream.getTracks().forEach((track) => track.stop())
          document.body.removeChild(modal)
        }
      })
      .catch((err) => {
        console.error("Error accessing camera:", err)
        setError("Failed to access camera. Please check permissions and try again.")
      })
  }, [applyDesignsToUserHand])

  // Save image
  const handleSaveImage = useCallback(() => {
    if (processedImage) {
      const link = document.createElement("a")
      link.download = `nail-design-${Date.now()}.png`
      link.href = processedImage
      link.click()
      setStatusMessage("Image saved successfully!")
    }
  }, [processedImage])

  // Share image
  const handleShare = useCallback(async () => {
    if (processedImage) {
      try {
        const response = await fetch(processedImage)
        const blob = await response.blob()
        const file = new File([blob], "nail-design.png", { type: "image/png" })

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: "My Virtual Nail Design!",
            text: "Check out this nail design I tried on!",
            files: [file],
          })
          setStatusMessage("Image shared successfully!")
        } else {
          handleSaveImage()
          setStatusMessage("Sharing not supported. Image saved instead.")
        }
      } catch (err) {
        console.error("Share failed:", err)
        handleSaveImage()
      }
    }
  }, [processedImage, handleSaveImage])

  // Reset application
  const handleReset = useCallback(() => {
    setPostImage(null)
    setUserImage(null)
    setProcessedImage(null)
    setExtractedDesigns([])
    setCurrentStep("upload")
    setError(null)
    setStatusMessage("Upload a nail design image to start.")
  }, [])

  return (
    <div className="w-full max-w-4xl p-6 bg-white shadow-xl rounded-lg">
      {/* Hidden canvases for processing */}
      <canvas ref={postImageCanvasRef} style={{ display: "none" }} />
      <canvas ref={userImageCanvasRef} style={{ display: "none" }} />
      <canvas ref={extractionCanvasRef} style={{ display: "none" }} />

      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-pink-600 mb-2">Professional Nail Design Try-On</h2>
        <p className="text-gray-600">Extract real nail designs from images and try them on your hands!</p>
        {!isMediaPipeLoaded && <p className="text-orange-600 text-sm mt-2">Loading MediaPipe Hands...</p>}
      </div>

      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {[
            { step: "upload", icon: Upload, label: "Upload Design" },
            { step: "extract", icon: Scissors, label: "Extract Patterns" },
            { step: "capture", icon: Camera, label: "Capture Hand" },
            { step: "apply", icon: Sparkles, label: "Apply Design" },
          ].map(({ step, icon: Icon, label }, index) => (
            <div key={step} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  currentStep === step
                    ? "bg-pink-500 text-white"
                    : ["upload", "extract", "capture", "apply"].indexOf(currentStep) > index
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="ml-2 text-sm font-medium">{label}</span>
              {index < 3 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Upload Design Image */}
      {currentStep === "upload" && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 1: Upload Nail Design Image</h3>
          <div className="border-2 border-dashed border-pink-300 rounded-lg p-8 mb-4">
            <Upload className="w-12 h-12 text-pink-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">Upload an image containing nail designs you want to extract</p>
            <Input
              type="file"
              accept="image/*"
              onChange={handlePostImageUpload}
              className="max-w-md mx-auto file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
            />
          </div>

          {postImage && (
            <div className="mb-4">
              <img
                src={postImage || "/placeholder.svg"}
                alt="Uploaded nail design"
                className="mx-auto rounded-lg shadow-md object-cover max-w-sm h-auto"
              />
              <Button
                onClick={extractNailDesigns}
                className="mt-4 bg-pink-500 hover:bg-pink-600 text-white"
                disabled={isLoading || !handsModel}
              >
                <Scissors className="mr-2 h-4 w-4" />
                Extract Nail Designs
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Show Extracted Designs */}
      {currentStep === "extract" && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 2: Extracted Nail Designs</h3>
          <div className="grid grid-cols-5 gap-4 mb-6">
            {extractedDesigns.map((design, index) => (
              <div key={design.fingerId} className="border rounded-lg p-2">
                <canvas
                  ref={(el) => {
                    if (el && design.canvas) {
                      el.width = design.canvas.width
                      el.height = design.canvas.height
                      const ctx = el.getContext("2d")
                      if (ctx) {
                        ctx.drawImage(design.canvas, 0, 0)
                      }
                    }
                  }}
                  className="w-full h-16 object-contain"
                />
                <p className="text-xs text-gray-600 mt-1 capitalize">{design.fingerId}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => setCurrentStep("capture")} className="bg-pink-500 hover:bg-pink-600 text-white">
            <Camera className="mr-2 h-4 w-4" />
            Continue to Hand Capture
          </Button>
        </div>
      )}

      {/* Step 3: Capture User Hand */}
      {currentStep === "capture" && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 3: Capture Your Hand</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center">
              <h4 className="font-medium mb-2">Upload Photo</h4>
              <Input
                type="file"
                accept="image/*"
                onChange={handleUserImageUpload}
                className="mb-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
              />
              <p className="text-sm text-gray-500">Select a photo from your device</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center">
              <h4 className="font-medium mb-2">Take Photo</h4>
              <Button onClick={handleCameraCapture} className="bg-pink-500 hover:bg-pink-600 text-white mb-2">
                <Camera className="mr-2 h-4 w-4" /> Use Camera
              </Button>
              <p className="text-sm text-gray-500">Take a photo with your device camera</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-blue-800 mb-2">📋 Tips for Best Results:</h4>
            <ul className="text-sm text-blue-700 text-left list-disc list-inside space-y-1">
              <li>Ensure your hand is well-lit and clearly visible</li>
              <li>Position your hand similar to the reference image</li>
              <li>Keep fingers slightly spread apart</li>
              <li>Avoid shadows or reflections</li>
              <li>Use a plain background if possible</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 4: Show Result */}
      {currentStep === "apply" && processedImage && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 4: Your Virtual Nail Design!</h3>
          <div className="border-2 border-pink-300 rounded-lg overflow-hidden shadow-md inline-block mb-6">
            <img src={processedImage || "/placeholder.svg"} alt="Processed nail design" className="max-w-full h-auto" />
          </div>

          <div className="flex justify-center gap-3 mb-4">
            <Button
              onClick={handleSaveImage}
              variant="outline"
              className="border-pink-500 text-pink-500 hover:bg-pink-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Save Image
            </Button>
            <Button onClick={handleShare} className="bg-green-500 hover:bg-green-600 text-white">
              <Share2 className="mr-2 h-4 w-4" />
              Share Result
            </Button>
            <Button onClick={handleReset} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Another Design
            </Button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 mb-2">🎉 Success!</h4>
            <p className="text-sm text-green-700">
              Your nail design has been successfully applied! The design was extracted from the original image and
              precisely positioned on your nails using advanced hand detection technology.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center my-6">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-pink-500" />
          <p className="mt-2 text-gray-600">{statusMessage}</p>
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-700">
              {currentStep === "extract" && "Analyzing hand landmarks and extracting nail designs..."}
              {currentStep === "capture" && "Processing your image and applying designs..."}
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Status Message */}
      {!isLoading && !error && (
        <div className="text-center mt-4">
          <p className="text-gray-600">{statusMessage}</p>
        </div>
      )}

      {/* Technical Information */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-800 mb-2">🔧 Technical Details:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <p>
              <strong>Hand Detection:</strong> MediaPipe Hands
            </p>
            <p>
              <strong>Landmarks Used:</strong> Points 4, 8, 12, 16, 20 (fingertips)
            </p>
            <p>
              <strong>Background Removal:</strong> Advanced skin tone detection
            </p>
          </div>
          <div>
            <p>
              <strong>Design Extraction:</strong> Automated nail region cropping
            </p>
            <p>
              <strong>Application Method:</strong> Landmark-based positioning
            </p>
            <p>
              <strong>Processing:</strong> Canvas API with advanced blending
            </p>
          </div>
        </div>
      </div>

      {/* Result Canvas (hidden) */}
      <canvas ref={resultCanvasRef} className="hidden" />
    </div>
  )
}
