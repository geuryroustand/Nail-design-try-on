import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Download, RefreshCw, Share2, Sparkles, AlertTriangle, Camera, Upload, Scissors } from "lucide-react"

// Types for MediaPipe Hands
type HandLandmark = {
  x: number
  y: number
  z?: number
}

type HandsResults = {
  multiHandLandmarks?: HandLandmark[][]
  multiHandedness?: any[]
}

declare global {
  interface Window {
    Hands: any
    drawConnectors: any
    drawLandmarks: any
  }
}

// Finger tip and base landmark indices for MediaPipe Hands
const FINGER_LANDMARKS = {
  THUMB: { tip: 4, base: 2, mid: 3 },
  INDEX: { tip: 8, base: 6, mid: 7 },
  MIDDLE: { tip: 12, base: 10, mid: 11 },
  RING: { tip: 16, base: 14, mid: 15 },
  PINKY: { tip: 20, base: 18, mid: 19 }
}

type ExtractedNailDesign = {
  fingerId: string
  design: HTMLCanvasElement
  position: { x: number, y: number }
  rotation: number
  scale: number
}

export default function AdvancedNailTryOn() {
  // State management
  const [postImage, setPostImage] = useState<string | null>(null)
  const [userImage, setUserImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [extractedDesigns, setExtractedDesigns] = useState<ExtractedNailDesign[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<'upload' | 'extract' | 'capture' | 'apply'>('upload')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("Upload a nail design image to start.")
  const [handsModel, setHandsModel] = useState<any>(null)

  // Canvas refs
  const postImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const userImageCanvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const extractionCanvasRef = useRef<HTMLCanvasElement>(null)

  // Load MediaPipe Hands
  const loadMediaPipeHands = useCallback(() => {
    try {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.min.js"
      script.async = true
      script.crossOrigin = "anonymous"

      script.onload = () => {
        try {
          const drawingUtilsScript = document.createElement("script")
          drawingUtilsScript.src = "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"
          drawingUtilsScript.async = true
          drawingUtilsScript.crossOrigin = "anonymous"

          drawingUtilsScript.onload = () => {
            try {
              if (typeof window.Hands === "undefined") {
                console.error("MediaPipe Hands not available")
                setError("MediaPipe Hands library failed to load. Please try refreshing the page.")
                return
              }

              const hands = new window.Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
              })

              hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.8,
                minTrackingConfidence: 0.8,
              })

              setHandsModel(hands)
              setStatusMessage("Ready! Upload a nail design image to extract patterns.")
            } catch (err) {
              console.error("Error initializing MediaPipe Hands:", err)
              setError("Failed to initialize hand detection. Please try refreshing the page.")
            }
          }

          drawingUtilsScript.onerror = () => {
            console.error("Failed to load MediaPipe drawing utils")
            setError("Failed to load required libraries. Please check your internet connection.")
          }

          document.body.appendChild(drawingUtilsScript)
        } catch (err) {
          console.error("Error loading drawing utils script:", err)
          setError("Failed to load required libraries. Please check your internet connection.")
        }
      }

      script.onerror = () => {
        console.error("Failed to load MediaPipe Hands")
        setError("Failed to load required libraries. Please check your internet connection.")
      }

      document.body.appendChild(script)
    } catch (err) {
      console.error("Error in loadMediaPipeHands:", err)
      setError("Failed to initialize. Please try refreshing the page.")
    }
  }, [])

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
  }, [loadMediaPipeHands])

  // Handle post image upload
  const handlePostImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (event && event.target && event.target.files && event.target.files[0]) {
        const file = event.target.files[0]
        const reader = new FileReader()

        reader.onload = (readerEvent) => {
          try {
            if (readerEvent && readerEvent.target && typeof readerEvent.target.result === "string") {
              const imageDataUrl = readerEvent.target.result
              setPostImage(imageDataUrl)
              setError(null)
              setStatusMessage("Image uploaded! Click 'Extract Designs' to analyze the nail patterns.")
            } else {
              setError("Failed to read the image data. Please try another image.")
            }
          } catch (err) {
            console.error("Error in FileReader onload:", err)
            setError("Failed to process the selected file. Please try another image.")
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
    setStatusMessage("Extracting nail designs from the image...")

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
            extractDesignsFromHand(results, image)
          })

          await handsModel.send({ image: canvas })
        } catch (err) {
          console.error("Error processing image with MediaPipe:", err)
          setError("Error processing hand detection. Please try another photo.")
          setIsLoading(false)
        }
      }

      image.onerror = () => {
        setError("Failed to load the uploaded image.")
        setIsLoading(false)
      }
    } catch (err) {
      console.error("Error in extractNailDesigns:", err)
      setError("Failed to extract designs. Please try another image.")
      setIsLoading(false)
    }
  }, [postImage, handsModel])

  // Extract designs from detected hand
  const extractDesignsFromHand = useCallback((results: HandsResults, originalImage: HTMLImageElement) => {
    try {
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        setError("No hand detected in the image. Please try an image with a clearly visible hand.")
        setIsLoading(false)
        return
      }

      const handLandmarks = results.multiHandLandmarks[0]
      const extractedDesigns: ExtractedNailDesign[] = []
      const extractionCanvas = extractionCanvasRef.current

      if (!extractionCanvas) {
        setError("Extraction canvas not ready.")
        setIsLoading(false)
        return
      }

      const extractionCtx = extractionCanvas.getContext("2d")
      if (!extractionCtx) {
        setError("Could not get extraction canvas context.")
        setIsLoading(false)
        return
      }

      // Process each finger
      Object.entries(FINGER_LANDMARKS).forEach(([fingerName, landmarks]) => {
        try {
          const tipLandmark = handLandmarks[landmarks.tip]
          const baseLandmark = handLandmarks[landmarks.base]
          const midLandmark = handLandmarks[landmarks.mid]

          if (tipLandmark && baseLandmark && midLandmark) {
            // Convert normalized coordinates to pixel coordinates
            const tip = { x: tipLandmark.x * originalImage.naturalWidth, y: tipLandmark.y * originalImage.naturalHeight }
            const base = { x: baseLandmark.x * originalImage.naturalWidth, y: baseLandmark.y * originalImage.naturalHeight }
            const mid = { x: midLandmark.x * originalImage.naturalWidth, y: midLandmark.y * originalImage.naturalHeight }

            // Calculate nail area
            const nailLength = Math.sqrt(Math.pow(tip.x - base.x, 2) + Math.pow(tip.y - base.y, 2))
            const nailWidth = nailLength * 0.7 // Approximate nail width

            // Calculate rotation
            const rotation = Math.atan2(tip.y - base.y, tip.x - base.x)

            // Create nail design canvas
            const nailCanvas = document.createElement("canvas")
            nailCanvas.width = Math.max(nailWidth, 50)
            nailCanvas.height = Math.max(nailLength, 50)
            const nailCtx = nailCanvas.getContext("2d")

            if (nailCtx) {
              // Extract nail area from original image
              nailCtx.save()
              nailCtx.translate(nailCanvas.width / 2, nailCanvas.height / 2)
              nailCtx.rotate(-rotation)

              // Draw the nail area
              const sourceX = Math.max(0, tip.x - nailWidth / 2)
              const sourceY = Math.max(0, tip.y - nailLength / 2)
              const sourceWidth = Math.min(nailWidth, originalImage.naturalWidth - sourceX)
              const sourceHeight = Math.min(nailLength, originalImage.naturalHeight - sourceY)

              if (sourceWidth > 0 && sourceHeight > 0) {
                nailCtx.drawImage(
                  originalImage,
                  sourceX, sourceY, sourceWidth, sourceHeight,
                  -nailCanvas.width / 2, -nailCanvas.height / 2, nailCanvas.width, nailCanvas.height
                )
              }

              nailCtx.restore()

              // Apply advanced background removal and nail enhancement
              const imageData = nailCtx.getImageData(0, 0, nailCanvas.width, nailCanvas.height)
              const data = imageData.data

              // Enhanced skin tone detection and removal
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i]
                const g = data[i + 1]
                const b = data[i + 2]

                // Multiple skin tone detection methods
                const isSkinTone1 = (r > 95 && g > 40 && b > 20 && 
                                   Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
                                   Math.abs(r - g) > 15 && r > g && r > b)

                const isSkinTone2 = (r > 120 && g > 80 && b > 50 && 
                                   r > b && g > b && Math.abs(r - g) < 50)

                const isSkinTone3 = (r >= 60 && r <= 255 && g >= 40 && g <= 255 && b >= 20 && b <= 255 &&
                                   r > g && g > b && r > b && r - g >= 10 && g - b >= 5)

                // Background detection (very light or very dark areas)
                const isBackground = (r + g + b) < 30 || (r + g + b) > 650 ||
                                   (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10)

                if (isSkinTone1 || isSkinTone2 || isSkinTone3 || isBackground) {
                  data[i + 3] = 0 // Make transparent
                } else {
                  // Enhance nail design colors
                  const brightness = (r + g + b) / 3
                  const contrast = 1.3
                  const newR = Math.min(255, Math.max(0, (r - 128) * contrast + 128))
                  const newG = Math.min(255, Math.max(0, (g - 128) * contrast + 128))
                  const newB = Math.min(255, Math.max(0, (b - 128) * contrast + 128))
                  
                  data[i] = newR
                  data[i + 1] = newG
                  data[i + 2] = newB
                  data[i + 3] = Math.min(255, data[i + 3] * 1.2) // Slightly enhance opacity
                }
              }

              nailCtx.putImageData(imageData, 0, 0)

              extractedDesigns.push({
                fingerId: fingerName.toLowerCase(),
                design: nailCanvas,
                position: { x: tip.x, y: tip.y },
                rotation,
                scale: nailLength / 100 // Normalize scale
              })
            }
          }
        } catch (err) {
          console.error(`Error extracting design for ${fingerName}:`, err)
        }
      })

      setExtractedDesigns(extractedDesigns)
      setCurrentStep('capture')
      setStatusMessage(`Extracted ${extractedDesigns.length} nail designs! Now capture your hand to apply them.`)
      setIsLoading(false)
    } catch (err) {
      console.error("Error in extractDesignsFromHand:", err)
      setError("Error extracting nail designs. Please try another image.")
      setIsLoading(false)
    }
  }, [])

  // Camera capture functionality
  const handleCameraCapture = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera access is not supported in your browser.")
      return
    }

    try {
      const videoElement = document.createElement("video")
      const canvasElement = document.createElement("canvas")
      const canvasCtx = canvasElement.getContext("2d")

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          try {
            const modal = document.createElement("div")
            modal.style.position = "fixed"
            modal.style.top = "0"
            modal.style.left = "0"
            modal.style.width = "100%"
            modal.style.height = "100%"
            modal.style.backgroundColor = "rgba(0,0,0,0.9)"
            modal.style.zIndex = "1000"
            modal.style.display = "flex"
            modal.style.flexDirection = "column"
            modal.style.alignItems = "center"
            modal.style.justifyContent = "center"

            videoElement.srcObject = stream
            videoElement.style.maxWidth = "100%"
            videoElement.style.maxHeight = "80%"
            videoElement.style.transform = "scaleX(-1)"
            videoElement.autoplay = true
            modal.appendChild(videoElement)

            const captureBtn = document.createElement("button")
            captureBtn.textContent = "Take Photo"
            captureBtn.style.margin = "20px"
            captureBtn.style.padding = "10px 20px"
            captureBtn.style.backgroundColor = "#f472b6"
            captureBtn.style.color = "white"
            captureBtn.style.border = "none"
            captureBtn.style.borderRadius = "5px"
            captureBtn.style.cursor = "pointer"
            modal.appendChild(captureBtn)

            const cancelBtn = document.createElement("button")
            cancelBtn.textContent = "Cancel"
            cancelBtn.style.padding = "10px 20px"
            cancelBtn.style.backgroundColor = "#6b7280"
            cancelBtn.style.color = "white"
            cancelBtn.style.border = "none"
            cancelBtn.style.borderRadius = "5px"
            cancelBtn.style.cursor = "pointer"
            modal.appendChild(cancelBtn)

            document.body.appendChild(modal)

            captureBtn.onclick = () => {
              try {
                canvasElement.width = videoElement.videoWidth
                canvasElement.height = videoElement.videoHeight

                if (canvasCtx) {
                  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)
                  const imageDataUrl = canvasElement.toDataURL("image/png")

                  videoElement.srcObject = null
                  stream.getTracks().forEach((track) => track.stop())
                  document.body.removeChild(modal)

                  setUserImage(imageDataUrl)
                  setProcessedImage(null)
                  setError(null)
                  setStatusMessage("Processing your image...")
                  applyExtractedDesigns(imageDataUrl)
                }
              } catch (err) {
                console.error("Error capturing image:", err)
                setError("Failed to capture image. Please try again.")
                try {
                  videoElement.srcObject = null
                  stream.getTracks().forEach((track) => track.stop())
                  document.body.removeChild(modal)
                } catch (cleanupErr) {
                  console.error("Error during cleanup:", cleanupErr)
                }
              }
            }

            cancelBtn.onclick = () => {
              try {
                videoElement.srcObject = null
                stream.getTracks().forEach((track) => track.stop())
                document.body.removeChild(modal)
              } catch (err) {
                console.error("Error canceling camera:", err)
              }
            }
          } catch (err) {
            console.error("Error setting up camera UI:", err)
            setError("Failed to set up camera interface. Please try again.")
          }
        })
        .catch((err) => {
          console.error("Error accessing camera:", err)
          setError("Failed to access camera. Please check permissions and try again.")
        })
    } catch (err) {
      console.error("Error in handleCameraCapture:", err)
      setError("Failed to initialize camera. Please try again.")
    }
  }, [])

  // Handle user image capture/upload
  const handleUserImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (event && event.target && event.target.files && event.target.files[0]) {
        const file = event.target.files[0]
        const reader = new FileReader()

        reader.onload = (readerEvent) => {
          try {
            if (readerEvent && readerEvent.target && typeof readerEvent.target.result === "string") {
              const imageDataUrl = readerEvent.target.result
              setUserImage(imageDataUrl)
              setProcessedImage(null)
              setError(null)
              setStatusMessage("Processing your image...")
              applyExtractedDesigns(imageDataUrl)
            } else {
              setError("Failed to read the image data. Please try another image.")
            }
          } catch (err) {
            console.error("Error in FileReader onload:", err)
            setError("Failed to process the selected file. Please try another image.")
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
  const applyExtractedDesigns = useCallback(async (imageDataUrl: string) => {
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
            applyDesignsToUserHand(results, image)
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
      console.error("Error in applyExtractedDesigns:", err)
      setError("Failed to apply designs. Please try another image.")
      setIsLoading(false)
    }
  }, [handsModel, extractedDesigns])

  // Apply designs to user's hand
  const applyDesignsToUserHand = useCallback((results: HandsResults, originalImage: HTMLImageElement) => {
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
            const tip = { x: tipLandmark.x * resultCanvas.width, y: tipLandmark.y * resultCanvas.height }
            const base = { x: baseLandmark.x * resultCanvas.width, y: baseLandmark.y * resultCanvas.height }
            const mid = { x: midLandmark.x * resultCanvas.width, y: midLandmark.y * resultCanvas.height }

            const nailLength = Math.sqrt(Math.pow(tip.x - base.x, 2) + Math.pow(tip.y - base.y, 2))
            const rotation = Math.atan2(tip.y - mid.y, tip.x - mid.x)

            const design = extractedDesigns[index].design
            const scaledWidth = design.width * (nailLength / 100)
            const scaledHeight = design.height * (nailLength / 100)

            ctx.save()
            ctx.translate(tip.x, tip.y)
            ctx.rotate(rotation)
            ctx.drawImage(
              design,
              -scaledWidth / 2,
              -scaledHeight / 2,
              scaledWidth,
              scaledHeight
            )
            ctx.restore()
            designsApplied++
          }
        })

        if (designsApplied > 0) {
          setStatusMessage(`Applied ${designsApplied} nail designs! Check out your virtual manicure.`)
        } else {
          setStatusMessage("Could not apply designs. Please ensure your hand is clearly visible.")
        }
        setProcessedImage(resultCanvas.toDataURL("image/png"))
        setCurrentStep('apply')
      } else {
        setStatusMessage("No hand detected in your image. Please try a clearer photo.")
        ctx.drawImage(originalImage, 0, 0, resultCanvas.width, resultCanvas.height)
        setProcessedImage(resultCanvas.toDataURL("image/png"))
      }
    } catch (err) {
      console.error("Error in applyDesignsToUserHand:", err)
      setError("Error applying nail designs. Please try another photo.")
    } finally {
      setIsLoading(false)
    }
  }, [extractedDesigns])

  // Save image
  const handleSaveImage = useCallback(() => {
    if (processedImage) {
      try {
        const link = document.createElement("a")
        link.download = `nail-design-try-on-${new Date().getTime()}.png`
        link.href = processedImage
        link.click()
        setStatusMessage("Image saved successfully!")
      } catch (err) {
        console.error("Error saving image:", err)
        setError("Failed to save image. Please try again.")
      }
    }
  }, [processedImage])

  // Share image
  const handleShare = useCallback(async () => {
    if (processedImage) {
      try {
        const response = await fetch(processedImage)
        const blob = await response.blob()
        const file = new File([blob], "nail-design-try-on.png", { type: "image/png" })
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "My Virtual Nail Design!",
            text: "Check out this nail design I tried on!",
            files: [file],
          })
          setStatusMessage("Image shared successfully!")
        } else {
          // Fallback: copy to clipboard or save
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const img = new Image()
          
          img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx?.drawImage(img, 0, 0)
            
            canvas.toBlob((blob) => {
              if (blob && navigator.clipboard) {
                navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]).then(() => {
                  setStatusMessage("Image copied to clipboard!")
                }).catch(() => {
                  handleSaveImage() // Fallback to save
                })
              } else {
                handleSaveImage() // Fallback to save
              }
            })
          }
          
          img.src = processedImage
        }
      } catch (err) {
        console.error("Share failed:", err)
        setStatusMessage("Sharing not supported. Image will be saved instead.")
        handleSaveImage()
      }
    }
  }, [processedImage, handleSaveImage])

  // Reset to start
  const handleReset = useCallback(() => {
    setPostImage(null)
    setUserImage(null)
    setProcessedImage(null)
    setExtractedDesigns([])
    setCurrentStep('upload')
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
        <h2 className="text-3xl font-bold text-pink-600 mb-2">Advanced Nail Design Try-On</h2>
        <p className="text-gray-600">Extract real nail designs from images and try them on your hands!</p>
      </div>

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
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                currentStep === step ? 'bg-pink-500 text-white' : 
                ['upload', 'extract', 'capture', 'apply'].indexOf(currentStep) > index ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="ml-2 text-sm font-medium">{label}</span>
              {index < 3 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Upload Design Image */}
      {currentStep === 'upload' && (
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
                src={postImage}
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
      {currentStep === 'extract' && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 2: Extracted Nail Designs</h3>
          <div className="grid grid-cols-5 gap-4 mb-6">
            {extractedDesigns.map((design, index) => (
              <div key={design.fingerId} className="border rounded-lg p-2">
                <canvas
                  ref={(el) => {
                    if (el && design.design) {
                      el.width = design.design.width
                      el.height = design.design.height
                      const ctx = el.getContext("2d")
                      if (ctx) {
                        ctx.drawImage(design.design, 0, 0)
                      }
                    }
                  }}
                  className="w-full h-16 object-contain"
                />
                <p className="text-xs text-gray-600 mt-1 capitalize">{design.fingerId}</p>
              </div>
            ))}
          </div>
          <Button 
            onClick={() => setCurrentStep('capture')} 
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            <Camera className="mr-2 h-4 w-4" />
            Continue to Hand Capture
          </Button>
        </div>
      )}

      {/* Step 3: Capture User Hand */}
      {currentStep === 'capture' && (
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
          <p className="text-sm text-gray-500 mb-4">For best results, ensure your hand is well-lit and clearly visible</p>
        </div>
      )}

      {/* Step 4: Show Result */}
      {currentStep === 'apply' && processedImage && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Step 4: Your Virtual Nail Design!</h3>
          <div className="border-2 border-pink-300 rounded-lg overflow-hidden shadow-md inline-block mb-6">
            <img
              src={processedImage}
              alt="Processed nail design"
              className="max-w-full h-auto"
            />
          </div>
          
          <div className="flex justify-center gap-3">
            <Button onClick={handleSaveImage} variant="outline" className="border-pink-500 text-pink-500 hover:bg-pink-50">
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
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center my-6">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-pink-500" />
          <p className="mt-2 text-gray-600">{statusMessage}</p>
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

      {/* Result Canvas (hidden) */}
      <canvas
        ref={resultCanvasRef}
        className="hidden"
      />
    </div>
  )
}
