"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader, AlertCircle, Camera, Sparkles, Trash2, Plus } from "lucide-react"
import { SearchResultGrid } from "@/components/search-result-grid"
import { apiClient } from "@/lib/api-client"

interface SearchResult {
  id: string
  url: string
  eventName: string
  eventDate: string
  confidence: number
}

interface SearchReferencePhoto {
  id: string
  storageUrl: string
  thumbnailUrl?: string
  createdAt: string
}

export default function PreInsertSearchPage() {
  const router = useRouter()
  const fileInputRef1 = useRef<HTMLInputElement>(null)
  const fileInputRef2 = useRef<HTMLInputElement>(null)
  const fileInputRef3 = useRef<HTMLInputElement>(null)
  const savedPhotoInputRef = useRef<HTMLInputElement>(null)
  
  const [uploadedImage1, setUploadedImage1] = useState<string | null>(null)
  const [uploadedImage2, setUploadedImage2] = useState<string | null>(null)
  const [uploadedImage3, setUploadedImage3] = useState<string | null>(null)
  
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  
  const [savedSearchPhotos, setSavedSearchPhotos] = useState<SearchReferencePhoto[]>([])
  const [isLoadingSavedPhotos, setIsLoadingSavedPhotos] = useState(false)
  const [isUploadingSaved, setIsUploadingSaved] = useState(false)
  const [isDeletingSaved, setIsDeletingSaved] = useState<string | null>(null)
  const [selectedSavedPhotoIds, setSelectedSavedPhotoIds] = useState<string[]>([])

  useEffect(() => {
    const authToken = localStorage.getItem("auth_token")
    if (!authToken) {
      router.push("/login")
      return
    }
    loadSavedSearchPhotos()
  }, [router])

  const loadSavedSearchPhotos = async () => {
    setIsLoadingSavedPhotos(true)
    const { data, error } = await apiClient.getUserSearchPhotos()
    if (error) {
      console.error('Error loading saved photos:', error)
    } else if (data) {
      setSavedSearchPhotos(data)
    }
    setIsLoadingSavedPhotos(false)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, imageNumber: number) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file")
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB")
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const imageData = e.target?.result as string
      
      if (imageNumber === 1) setUploadedImage1(imageData)
      else if (imageNumber === 2) setUploadedImage2(imageData)
      else if (imageNumber === 3) setUploadedImage3(imageData)
      
      setSearchResults([])
      setHasSearched(false)
    }
    reader.readAsDataURL(file)
  }

  const handleSavedPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file")
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB")
      return
    }

    setIsUploadingSaved(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const imageData = e.target?.result as string
      const { data, error } = await apiClient.uploadSearchReferencePhoto(imageData)

      if (error) {
        setError(`Failed to save photo: ${error}`)
      } else if (data) {
        await loadSavedSearchPhotos()
      }
      setIsUploadingSaved(false)
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteSavedPhoto = async (photoId: string) => {
    setIsDeletingSaved(photoId)
    const { error } = await apiClient.deleteSearchPhoto(photoId)
    
    if (error) {
      setError(`Failed to delete photo: ${error}`)
    } else {
      await loadSavedSearchPhotos()
    }
    setIsDeletingSaved(null)
  }

  const toggleSavedPhotoSelection = (photoId: string) => {
    setSelectedSavedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId],
    )
  }

  const handleSearchWithSavedSelection = async () => {
    if (selectedSavedPhotoIds.length === 0) {
      setError("Please select at least one saved photo")
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const selectedPhotos = savedSearchPhotos.filter((photo) =>
        selectedSavedPhotoIds.includes(photo.id),
      )

      const allResults: SearchResult[] = []

      for (const photo of selectedPhotos) {
        const { data, error } = await apiClient.searchByFace(photo.storageUrl)

        if (error) {
          console.error('Search error for one saved photo:', error)
          continue
        }

        if (data && data.results) {
          allResults.push(...data.results)
        }
      }

      const uniqueResults = Array.from(
        new Map(allResults.map(item => [item.id, item])).values()
      )

      const sortedResults = uniqueResults.sort((a, b) => b.confidence - a.confidence)
      setSearchResults(sortedResults)

      setHasSearched(true)
    } catch (err) {
      console.error('Full error:', err)
      setError(`Face search failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = async () => {
    if (!uploadedImage1 && !uploadedImage2 && !uploadedImage3) {
      setError("Please upload at least one image")
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const allResults: SearchResult[] = []
      const uploadedImages = [uploadedImage1, uploadedImage2, uploadedImage3].filter(img => img !== null)

      for (const image of uploadedImages) {
        if (!image) continue
        
        const { data, error } = await apiClient.searchByFace(image)

        if (error) {
          console.error('Search error for one image:', error)
          continue
        }

        if (data && data.results) {
          allResults.push(...data.results)
        }
      }

      const uniqueResults = Array.from(
        new Map(allResults.map(item => [item.id, item])).values()
      )

      const sortedResults = uniqueResults.sort((a, b) => b.confidence - a.confidence)
      
      setSearchResults(sortedResults)
      setHasSearched(true)

    } catch (err) {
      console.error('Full error:', err)
      setError(`Face search failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const UploadBox = ({ 
    imageNumber, 
    uploadedImage, 
    fileInputRef 
  }: { 
    imageNumber: number
    uploadedImage: string | null
    fileInputRef: React.RefObject<HTMLInputElement>
  }) => (
    <div className="flex-1">
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors bg-card/50 h-full"
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="image/*" 
          onChange={(e) => handleFileUpload(e, imageNumber)} 
          className="hidden" 
        />

        {uploadedImage ? (
          <div className="space-y-3">
            <div className="relative w-24 h-24 mx-auto">
              <img
                src={uploadedImage || "/placeholder.svg"}
                alt={`Uploaded image ${imageNumber}`}
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground">Click to change</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Camera className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">Photo {imageNumber}</p>
              <p className="text-xs text-muted-foreground">Click to upload</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <Header showLogout />
      <main className="min-h-screen bg-gradient-to-b from-background to-secondary/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">AI-Powered Face Search</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">Search with Face</h1>
            <p className="text-muted-foreground mt-3 text-base sm:text-lg px-4">
              Upload temporary or save permanent selfies to improve match accuracy across campus events
            </p>
          </div>

          <div className="max-w-6xl mx-auto space-y-8">
            
            {/* Saved Search Photos Section */}
            <Card className="border-2 border-accent/30 mb-8 bg-gradient-to-br from-card to-accent/5">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    Saved Search Photos (Persistent)
                  </span>
                  <Button
                    size="sm"
                    onClick={() => savedPhotoInputRef.current?.click()}
                    disabled={isUploadingSaved || savedSearchPhotos.length >= 3}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Photo
                  </Button>
                </CardTitle>
                <CardDescription>
                  Save up to 3 photos that persist across sessions. These will stay unless you delete them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input 
                  ref={savedPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSavedPhotoUpload}
                  className="hidden"
                />

                {isLoadingSavedPhotos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : savedSearchPhotos.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {savedSearchPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className={
                            "relative group rounded-lg border-2 p-2 transition-colors " +
                            (selectedSavedPhotoIds.includes(photo.id)
                              ? "border-primary bg-primary/5"
                              : "border-border")
                          }
                        >
                          <img
                            src={photo.thumbnailUrl || photo.storageUrl}
                            alt="Saved search photo"
                            className="w-full h-40 object-cover rounded-md"
                          />
                          <button
                            type="button"
                            onClick={() => toggleSavedPhotoSelection(photo.id)}
                            className={
                              "absolute top-2 left-2 rounded-full border px-2 py-1 text-xs font-semibold " +
                              (selectedSavedPhotoIds.includes(photo.id)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background/80 text-foreground border-border")
                            }
                          >
                            {selectedSavedPhotoIds.includes(photo.id) ? "Selected" : "Select"}
                          </button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteSavedPhoto(photo.id)}
                            disabled={isDeletingSaved === photo.id}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {isDeletingSaved === photo.id ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={handleSearchWithSavedSelection}
                      disabled={selectedSavedPhotoIds.length === 0 || isSearching}
                      className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground py-6"
                      size="lg"
                    >
                      {isSearching ? (
                        <>
                          <Loader className="w-5 h-5 mr-2 animate-spin" />
                          Searching with AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 mr-2" />
                          Search Selected Saved Photos
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No saved search photos yet. Add one to get started!</p>
                  </div>
                )}

                {savedSearchPhotos.length >= 3 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      You've reached the maximum of 3 saved photos. Delete one to add another.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Upload Section */}
            <Card className="border-2 border-primary/30 mb-8 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" />
                  Temporary Search Photos (1-3)
                </CardTitle>
                <CardDescription>Upload temporary photos for this search. These will be cleared when you're done.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="flex gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <UploadBox 
                    imageNumber={1} 
                    uploadedImage={uploadedImage1} 
                    fileInputRef={fileInputRef1}
                  />
                  <UploadBox 
                    imageNumber={2} 
                    uploadedImage={uploadedImage2} 
                    fileInputRef={fileInputRef2}
                  />
                  <UploadBox 
                    imageNumber={3} 
                    uploadedImage={uploadedImage3} 
                    fileInputRef={fileInputRef3}
                  />
                </div>

                <Button
                  onClick={handleSearch}
                  disabled={(!uploadedImage1 && !uploadedImage2 && !uploadedImage3) || isSearching}
                  className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground py-6"
                  size="lg"
                >
                  {isSearching ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />
                      Searching with AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Search My Photos
                    </>
                  )}
                </Button>

                <div className="p-4 bg-muted/30 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">
                    Your uploaded images are processed locally first and not stored on our servers. Only aggregate face
                    embeddings are used for matching against event photos.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {hasSearched && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">AI Match Results</h3>
                      <p className="text-sm text-muted-foreground">
                        Found <span className="font-bold text-primary">{searchResults.length}</span> photo{searchResults.length !== 1 ? 's' : ''} where your face was detected.
                        {searchResults.length > 0 && ' Results are sorted by match confidence (highest first).'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-foreground">Your Photos</h2>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUploadedImage1(null)
                      setUploadedImage2(null)
                      setUploadedImage3(null)
                      setSearchResults([])
                      setHasSearched(false)
                    }}
                    className="border-border"
                  >
                    New Search
                  </Button>
                </div>

                {searchResults.length > 0 ? (
                  <SearchResultGrid photos={searchResults} />
                ) : (
                  <Card className="border border-border">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">No matching photos found. Try uploading different images.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Help Section */}
            {!hasSearched && !uploadedImage1 && !uploadedImage2 && !uploadedImage3 && (
              <Card className="border border-border mt-8 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-lg">Tips for Best Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>- Save 2-3 different selfies for persistent searching across visits</p>
                  <p>- Upload temporary photos for quick one-time searches</p>
                  <p>- Use clear, well-lit photos with your face clearly visible</p>
                  <p>- Different angles and expressions can help find more matches</p>
                  <p>- Avoid heavy filters or makeup changes from event photos</p>
                  <p>- The system combines results from all uploaded photos for better accuracy</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
