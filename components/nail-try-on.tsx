"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Download, RefreshCw, Share2, Sparkles, AlertTriangle, Camera } from "lucide-react"
import type { Hands, Results as HandsResults } from "@mediapipe/hands"

// Define a type for the global Hands object if it's not already typed
declare global {
  interface Window {
    Hands: any // Replace 'any' with a more specific type if available
    drawConnectors: any
    drawLandmarks: any
  }
}

// Use the provided image URL
const POST_IMAGE_URL = "/images/colorful-french-tips.jpg"

// Define nail design types
type NailDesign = {
  id: string
  name: string
  description: string
  generateDesign: () => HTMLImageElement
}

export default function NailTryOn() {
  const [userImage, setUserImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("Click 'Try This Design' to start.")

  const [isDesignSelected, setIsDesignSelected] = useState(false)
  const [handsModel, setHandsModel] = useState<Hands | null>(null)
  const [sampleNailDesignImg, setSampleNailDesignImg] = useState<HTMLImageElement | null>(null)
  const [selectedDesignIndex, setSelectedDesignIndex] = useState(0)

  const userImageCanvasRef = useRef<HTMLCanvasElement>(null) // Hidden canvas for processing user image
  const resultCanvasRef = useRef<HTMLCanvasElement>(null) // Visible canvas for result
  const postImageRef = useRef<HTMLImageElement | null>(null)

  // Generate a colorful French tip nail design programmatically
  const generateColorfulFrenchTip = useCallback((color: string) => {
    try {
      const canvas = document.createElement("canvas")
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext("2d")
      if (ctx) {
        // Create a transparent background
        ctx.fillStyle = "rgba(255, 255, 255, 0)"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Create a nail shape (oval)
        ctx.beginPath()
        ctx.ellipse(100, 100, 80, 50, 0, 0, 2 * Math.PI)
        ctx.fillStyle = "rgba(255, 235, 235, 0.6)" // Very light pink base
        ctx.fill()

        // Add French tip
        ctx.beginPath()
        ctx.ellipse(100, 60, 70, 20, 0, 0, Math.PI, true)
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)" // White tip
        ctx.fill()

        // Add colored outline to the tip
        ctx.beginPath()
        ctx.ellipse(100, 60, 70, 20, 0, 0, Math.PI, true)
        ctx.lineWidth = 5
        ctx.strokeStyle = color
        ctx.stroke()

        // Add shine effect
        ctx.beginPath()
        ctx.ellipse(70, 110, 10, 40, Math.PI / 4, 0, 2 * Math.PI)
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)"
        ctx.fill()

        // Convert to image
        const designImg = new window.Image()
        designImg.src = canvas.toDataURL("image/png")
        return designImg
      }
    } catch (err) {
      console.error("Error generating nail design:", err)
    }

    // Fallback if canvas context fails
    const fallbackImg = new window.Image()
    fallbackImg.src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    return fallbackImg
  }, [])

  // Define available nail designs
  const nailDesigns = useMemo(
    () => [
      {
        id: "purple-french",
        name: "Purple French Tip",
        description: "Elegant French tip with purple outline",
        generateDesign: () => generateColorfulFrenchTip("rgba(147, 112, 219, 0.9)"),
      },
      {
        id: "blue-french",
        name: "Blue French Tip",
        description: "Classic French tip with blue outline",
        generateDesign: () => generateColorfulFrenchTip("rgba(65, 105, 225, 0.9)"),
      },
      {
        id: "pink-french",
        name: "Pink French Tip",
        description: "Stylish French tip with pink outline",
        generateDesign: () => generateColorfulFrenchTip("rgba(255, 105, 180, 0.9)"),
      },
      {
        id: "green-french",
        name: "Green French Tip",
        description: "Fresh French tip with green outline",
        generateDesign: () => generateColorfulFrenchTip("rgba(50, 205, 50, 0.9)"),
      },
      {
        id: "orange-french",
        name: "Orange French Tip",
        description: "Vibrant French tip with orange outline",
        generateDesign: () => generateColorfulFrenchTip("rgba(255, 165, 0, 0.9)"),
      },
    ],
    [generateColorfulFrenchTip],
  )

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
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7,
              })

              setHandsModel(hands)
              setStatusMessage("Ready to try designs. Upload your hand photo!")
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

    // Generate the selected nail design
    try {
      if (nailDesigns && nailDesigns[selectedDesignIndex]) {
        const designImg = nailDesigns[selectedDesignIndex].generateDesign()

        designImg.onload = () => {
          setSampleNailDesignImg(designImg)
          setError(null)
        }

        designImg.onerror = () => {
          console.error("Failed to create nail design image")
          setError("Failed to create nail design. Please try refreshing the page.")
        }
      }
    } catch (err) {
      console.error("Error generating nail design:", err)
      setError("Failed to create nail design. Please try refreshing the page.")
    }

    // Load the post image to reference
    try {
      const img = new Image()
      img.src = POST_IMAGE_URL

      img.onload = () => {
        postImageRef.current = img
      }

      img.onerror = () => {
        console.error("Failed to load post image")
        setError("Failed to load nail design image. Using a placeholder instead.")
      }
    } catch (err) {
      console.error("Error loading post image:", err)
    }

    return () => {
      if (handsModel) {
        try {
          handsModel.close()
        } catch (err) {
          console.error("Error closing MediaPipe Hands:", err)
        }
      }
    }
  }, [loadMediaPipeHands, selectedDesignIndex, nailDesigns])

  const handleTryThisDesign = useCallback(() => {
    setIsDesignSelected(true)
    setUserImage(null)
    setProcessedImage(null)
    setError(null)
    if (handsModel) {
      setStatusMessage("Nail design selected! Please upload a photo of your hand.")
    } else {
      setStatusMessage("MediaPipe is loading. Please wait a moment then upload.")
      setIsLoading(true) // Show loader while mediapipe might still be loading
    }
  }, [handsModel])

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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
              processImage(imageDataUrl)
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
      console.error("Error in handleImageUpload:", err)
      setError("Failed to process the selected file. Please try another image.")
    }
  }, [])

  const handleCameraCapture = useCallback(() => {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera access is not supported in your browser.")
      return
    }

    try {
      // Create elements for camera capture
      const videoElement = document.createElement("video")
      const canvasElement = document.createElement("canvas")
      const canvasCtx = canvasElement.getContext("2d")

      // Request camera access
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          try {
            // Create a modal for the camera view
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

            // Set up video element
            videoElement.srcObject = stream
            videoElement.style.maxWidth = "100%"
            videoElement.style.maxHeight = "80%"
            videoElement.style.transform = "scaleX(-1)" // Mirror effect
            videoElement.autoplay = true
            modal.appendChild(videoElement)

            // Create capture button
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

            // Create cancel button
            const cancelBtn = document.createElement("button")
            cancelBtn.textContent = "Cancel"
            cancelBtn.style.padding = "10px 20px"
            cancelBtn.style.backgroundColor = "#6b7280"
            cancelBtn.style.color = "white"
            cancelBtn.style.border = "none"
            cancelBtn.style.borderRadius = "5px"
            cancelBtn.style.cursor = "pointer"
            modal.appendChild(cancelBtn)

            // Add modal to document
            document.body.appendChild(modal)

            // Handle capture button click
            captureBtn.onclick = () => {
              try {
                // Set canvas dimensions to match video
                canvasElement.width = videoElement.videoWidth
                canvasElement.height = videoElement.videoHeight

                // Draw the current video frame to canvas
                if (canvasCtx) {
                  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)

                  // Convert canvas to data URL
                  const imageDataUrl = canvasElement.toDataURL("image/png")

                  // Clean up
                  videoElement.srcObject = null
                  stream.getTracks().forEach((track) => {
                    track.stop()
                  })
                  document.body.removeChild(modal)

                  // Process the captured image
                  setUserImage(imageDataUrl)
                  setProcessedImage(null)
                  setError(null)
                  setStatusMessage("Processing your image...")
                  processImage(imageDataUrl)
                }
              } catch (err) {
                console.error("Error capturing image:", err)
                setError("Failed to capture image. Please try again.")

                // Clean up on error
                try {
                  videoElement.srcObject = null
                  stream.getTracks().forEach((track) => {
                    track.stop()
                  })
                  document.body.removeChild(modal)
                } catch (cleanupErr) {
                  console.error("Error during cleanup:", cleanupErr)
                }
              }
            }

            // Handle cancel button click
            cancelBtn.onclick = () => {
              try {
                // Clean up
                videoElement.srcObject = null
                stream.getTracks().forEach((track) => {
                  track.stop()
                })
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

  const processImage = useCallback(
    async (imageDataUrl: string) => {
      if (!handsModel || !sampleNailDesignImg) {
        setError("Models not ready. Please wait or try refreshing.")
        setIsLoading(false)
        return
      }
      setIsLoading(true)

      try {
        const image = new window.Image()
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

            handsModel.onResults((results) => {
              onHandsResults(results, image)
            })

            try {
              await handsModel.send({ image: userCanvas })
            } catch (sendError) {
              console.error("Error sending image to MediaPipe:", sendError)
              setError("Error processing hand detection. Please try another photo.")
              setIsLoading(false)
            }
          } catch (err) {
            console.error("Error processing image with MediaPipe:", err)
            setError("Error processing image. Please try another photo.")
            setIsLoading(false)
          }
        }

        image.onerror = () => {
          setError("Failed to load user image for processing.")
          setIsLoading(false)
        }
      } catch (err) {
        console.error("Error in processImage:", err)
        setError("Failed to process image. Please try another photo.")
        setIsLoading(false)
      }
    },
    [handsModel, sampleNailDesignImg],
  )

  const onHandsResults = useCallback(
    (results: HandsResults, originalImage: HTMLImageElement) => {
      try {
        const resultCanvas = resultCanvasRef.current
        if (!resultCanvas || !sampleNailDesignImg) {
          setError("Result canvas or nail design not ready.")
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
          const handLandmarks = results.multiHandLandmarks[0] // Use the first detected hand

          // Apply to all fingers
          const fingerTipIndices = [4, 8, 12, 16, 20] // Thumb, Index, Middle, Ring, Pinky tips
          const fingerBaseIndices = [3, 6, 10, 14, 18] // Corresponding DIP joints
          const fingerMidIndices = [2, 5, 9, 13, 17] // Corresponding PIP joints

          // Use different designs for each finger
          let designsApplied = 0

          for (let i = 0; i < fingerTipIndices.length; i++) {
            const tipIdx = fingerTipIndices[i]
            const baseIdx = fingerBaseIndices[i]
            const midIdx = fingerMidIndices[i]

            const tip = handLandmarks[tipIdx]
            const base = handLandmarks[baseIdx]
            const mid = handLandmarks[midIdx]

            if (tip && base && mid) {
              // Convert normalized landmarks to pixel coordinates
              const tipPx = { x: tip.x * resultCanvas.width, y: tip.y * resultCanvas.height }
              const basePx = { x: base.x * resultCanvas.width, y: base.y * resultCanvas.height }
              const midPx = { x: mid.x * resultCanvas.width, y: mid.y * resultCanvas.height }

              // Calculate nail center (approximate) - closer to tip than base
              const nailCenterX = tipPx.x * 0.7 + basePx.x * 0.3
              const nailCenterY = tipPx.y * 0.7 + basePx.y * 0.3

              // Calculate nail length (distance between tip and base)
              const nailLength = Math.sqrt(Math.pow(tipPx.x - basePx.x, 2) + Math.pow(tipPx.y - basePx.y, 2))

              // Calculate rotation based on the segment from mid to tip for better finger orientation
              const angleRad = Math.atan2(tipPx.y - midPx.y, tipPx.x - midPx.x)

              // Get the appropriate design for this finger
              const designIndex = (selectedDesignIndex + i) % nailDesigns.length
              const designImg = nailDesigns[designIndex].generateDesign()

              // Scale the design
              const designAspectRatio = designImg.width / designImg.height || 1
              const scaledDesignHeight = nailLength * 0.8 // Adjust multiplier for better fit
              const scaledDesignWidth = scaledDesignHeight * designAspectRatio

              ctx.save()
              ctx.translate(nailCenterX, nailCenterY)
              ctx.rotate(angleRad)

              // Draw the design
              ctx.drawImage(
                designImg,
                -scaledDesignWidth / 2,
                -scaledDesignHeight / 2,
                scaledDesignWidth,
                scaledDesignHeight,
              )

              ctx.restore()
              designsApplied++
            }
          }

          if (designsApplied > 0) {
            setStatusMessage(`Design applied to ${designsApplied} nails! Check it out.`)
          } else {
            setStatusMessage("Could not identify all necessary finger landmarks.")
          }
          setProcessedImage(resultCanvas.toDataURL("image/png"))
        } else {
          setStatusMessage("No hand detected in the image. Please try a clearer photo.")
          // Draw the original image without overlay if no hand detected
          ctx.drawImage(originalImage, 0, 0, resultCanvas.width, resultCanvas.height)
          setProcessedImage(resultCanvas.toDataURL("image/png")) // Show original image in result canvas
        }
      } catch (err) {
        console.error("Error in onHandsResults:", err)
        setError("Error applying nail design. Please try another photo.")
      } finally {
        setIsLoading(false)
      }
    },
    [nailDesigns, selectedDesignIndex, sampleNailDesignImg],
  )

  const handleSaveImage = useCallback(() => {
    if (processedImage) {
      try {
        const link = document.createElement("a")
        link.download = "nail-try-on-result.png"
        link.href = processedImage
        link.click()
      } catch (err) {
        console.error("Error saving image:", err)
        setError("Failed to save image. Please try again.")
      }
    }
  }, [processedImage])

  const handleTryAgain = useCallback(() => {
    setUserImage(null)
    setProcessedImage(null)
    setError(null)
    setIsDesignSelected(false)
    setStatusMessage("Click 'Try This Design' to start.")
    if (resultCanvasRef.current) {
      const ctx = resultCanvasRef.current.getContext("2d")
      ctx?.clearRect(0, 0, resultCanvasRef.current.width, resultCanvasRef.current.height)
    }
  }, [])

  const handleShare = useCallback(async () => {
    if (processedImage) {
      try {
        const response = await fetch(processedImage)
        const blob = await response.blob()
        const file = new File([blob], "nail-try-on.png", { type: "image/png" })
        if (navigator.share) {
          await navigator.share({
            title: "My Virtual Nail Design!",
            text: "Check out this nail design I tried on!",
            files: [file],
          })
        } else {
          setError("Web Share API not supported in your browser. Please save and share manually.")
        }
      } catch (err) {
        console.error("Share failed:", err)
        setError("Could not share image. Please save and share manually.")
      }
    }
  }, [processedImage])

  return (
    <div className="w-full max-w-2xl p-6 bg-white shadow-xl rounded-lg">
      <canvas ref={userImageCanvasRef} style={{ display: "none" }} />

      {!isDesignSelected && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-pink-600 mb-4">Colorful French Tips</h2>
          <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden shadow-md">
            <Image
              src={POST_IMAGE_URL || "/placeholder.svg?height=400&width=600&query=colorful+nail+design"}
              alt="Colorful French tip nail design"
              width={600}
              height={400}
              className="w-full h-auto object-cover"
              priority
            />
          </div>
          <p className="text-gray-600 mb-4">
            Vibrant French tips with colorful outlines - perfect for adding a pop of color to your look!
          </p>
          <Button onClick={handleTryThisDesign} size="lg" className="bg-pink-500 hover:bg-pink-600 text-white">
            <Sparkles className="mr-2 h-5 w-5" /> Try This Design
          </Button>
        </div>
      )}

      {isDesignSelected && !userImage && (
        <div className="text-center">
          <p className="text-lg text-gray-700 mb-4">{statusMessage}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center">
              <h3 className="font-medium mb-2">Upload Photo</h3>
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="mb-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
              />
              <p className="text-sm text-gray-500">Select a photo from your device</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center">
              <h3 className="font-medium mb-2">Take Photo</h3>
              <Button onClick={handleCameraCapture} className="bg-pink-500 hover:bg-pink-600 text-white mb-2">
                <Camera className="mr-2 h-4 w-4" /> Use Camera
              </Button>
              <p className="text-sm text-gray-500">Take a photo with your device camera</p>
            </div>
          </div>
          <div className="text-sm text-gray-500 mb-4">
            For best results, ensure your hand is well-lit and clearly visible
          </div>
          {isLoading && !handsModel && (
            <div className="text-center my-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-pink-500" />
              <p className="mt-2 text-sm text-gray-600">Loading MediaPipe Hands model...</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && userImage && (
        <div className="text-center my-6">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-pink-500" />
          <p className="mt-2 text-gray-600">{statusMessage}</p>
        </div>
      )}

      {processedImage && !isLoading && (
        <div className="mt-6 text-center">
          <h3 className="text-2xl font-semibold text-pink-600 mb-4">Your Virtual Try-On!</h3>
          <div className="border-2 border-pink-300 rounded-lg overflow-hidden shadow-md inline-block">
            <Image
              src={processedImage || "/placeholder.svg?height=400&width=600&query=hand+with+nail+design"}
              alt="Processed nail design"
              width={600}
              height={400}
              className="max-w-full h-auto"
            />
          </div>
        </div>
      )}

      {/* Fallback display for result canvas if Image component fails for data URL */}
      <canvas
        ref={resultCanvasRef}
        className={`w-full max-w-md mx-auto rounded-lg shadow-md ${processedImage ? "hidden" : "hidden"}`}
      />

      {userImage && !isLoading && <p className="text-center text-gray-600 my-4">{statusMessage}</p>}

      {processedImage && !isLoading && (
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
          <Button
            onClick={handleSaveImage}
            variant="outline"
            className="border-pink-500 text-pink-500 hover:bg-pink-50"
          >
            <Download className="mr-2 h-4 w-4" /> Save Image
          </Button>
          <Button onClick={handleTryAgain} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Try Another Photo
          </Button>
          {navigator.share && (
            <Button onClick={handleShare} className="bg-green-500 hover:bg-green-600 text-white">
              <Share2 className="mr-2 h-4 w-4" /> Share Result
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
